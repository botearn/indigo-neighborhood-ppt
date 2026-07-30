import asyncio
import base64
import io
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.api import routes  # noqa: E402
from app.core import auth  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services import image_assets, image_generator, image_job_runner, image_jobs  # noqa: E402
from tests.test_indigo_pptx_images import _story  # noqa: E402


def _blank_story():
    story = _story()
    for beat in story.beats:
        for image_field in image_jobs.IMAGE_FIELDS:
            setattr(beat, image_field, None)
    return story


class ImageJobStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "jobs.db"
        self.store = image_jobs.SqliteImageJobStore(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_job_tracks_partial_results_and_retries_only_failures(self) -> None:
        job = self.store.create(user_id="user-1", story=_blank_story())
        targets = self.store.pending_targets(job.id)

        self.assertEqual(job.status, "queued")
        self.assertEqual(job.total, 24)
        self.assertEqual(len(targets), 24)

        self.store.mark_running(job.id)
        self.store.record_success(job.id, targets[0], "https://images.test/first.jpg")
        for key in targets[1:]:
            self.store.record_failure(job.id, key, "provider timeout")

        partial = self.store.get(job.id)
        self.assertEqual(partial.status, "partial")
        self.assertEqual(partial.completed, 1)
        self.assertEqual(partial.failed, 23)
        self.assertEqual(partial.story.beats[0].image_url, "https://images.test/first.jpg")

        retry_targets = self.store.prepare_retry(job.id)
        queued = self.store.get(job.id)
        self.assertEqual(set(retry_targets), set(targets[1:]))
        self.assertEqual(queued.status, "queued")
        self.assertEqual(queued.completed, 1)
        self.assertEqual(queued.failed, 0)

        reopened = image_jobs.SqliteImageJobStore(self.db_path).get(job.id)
        self.assertEqual(reopened.completed, 1)
        self.assertEqual(reopened.status, "queued")

    def test_existing_images_are_not_enqueued_again(self) -> None:
        story = _blank_story()
        story.beats[0].image_url = "https://images.test/existing.jpg"

        job = self.store.create(user_id="user-1", story=story)

        self.assertEqual(job.completed, 1)
        self.assertEqual(len(self.store.pending_targets(job.id)), 23)

    def test_cancelled_job_rejects_late_image_result(self) -> None:
        job = self.store.create(user_id="user-1", story=_blank_story())
        target = self.store.pending_targets(job.id)[0]

        self.store.request_cancel(job.id)
        recorded = self.store.record_success(
            job.id,
            target,
            "https://images.test/late.jpg",
        )

        self.assertFalse(recorded)
        self.assertEqual(self.store.get(job.id).completed, 0)


class ImageJobRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = image_jobs.SqliteImageJobStore(Path(self.temp_dir.name) / "jobs.db")
        self.original_media_dir = settings.image_job_media_dir
        self.original_public_base_url = settings.public_base_url
        settings.image_job_media_dir = str(Path(self.temp_dir.name) / "images")
        settings.public_base_url = "https://backend.example.test"

    def tearDown(self) -> None:
        settings.image_job_media_dir = self.original_media_dir
        settings.public_base_url = self.original_public_base_url
        self.temp_dir.cleanup()

    def test_generated_base64_is_persisted_as_a_short_file_url(self) -> None:
        image = Image.new("RGB", (2000, 1200), (30, 80, 120))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        generated = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"
        job = self.store.create(user_id="user-1", story=_blank_story())
        target = self.store.pending_targets(job.id)[0]

        with (
            patch.object(image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(
                image_generator,
                "generate_indigo_single_image",
                new=AsyncMock(return_value=generated),
            ),
        ):
            image_job_runner._run_target(job.id, target)

        updated = self.store.get(job.id)
        image_url = updated.story.beats[0].image_url
        self.assertIsNotNone(image_url)
        self.assertTrue(image_url.startswith("https://backend.example.test/api/indigo/image-assets/"))
        self.assertLess(len(image_url), 200)

        asset_name = image_url.rsplit("/", 1)[-1]
        asset_path = image_assets.resolve_image_asset(asset_name)
        with Image.open(asset_path) as persisted:
            self.assertLessEqual(persisted.width, 1792)
            self.assertLessEqual(persisted.height, 1024)

        response = TestClient(app).get(urlparse(image_url).path)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "image/jpeg")
        self.assertIn("immutable", response.headers["cache-control"])

    def test_running_job_resumes_after_store_reopens(self) -> None:
        job = self.store.create(user_id="user-1", story=_blank_story())
        first_target = self.store.pending_targets(job.id)[0]
        self.store.record_success(job.id, first_target, "https://images.test/existing.jpg")
        self.store.mark_running(job.id)
        reopened = image_jobs.SqliteImageJobStore(self.store.db_path)

        with (
            patch.object(image_jobs, "get_image_job_store", return_value=reopened),
            patch.object(
                image_generator,
                "generate_indigo_single_image",
                new=AsyncMock(return_value="data:image/png;base64,ignored"),
            ),
            patch.object(
                image_assets,
                "persist_image",
                return_value="https://backend.example.test/api/indigo/image-assets/resumed-image.jpg",
            ),
        ):
            image_job_runner.resume_pending_jobs()
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline and reopened.get(job.id).status != "completed":
                time.sleep(0.02)

        resumed = reopened.get(job.id)
        self.assertEqual(resumed.status, "completed")
        self.assertEqual(resumed.completed, 24)


class IndigoImageConcurrencyTest(unittest.TestCase):
    def test_legacy_batch_uses_bounded_concurrency_and_preserves_images(self) -> None:
        story = _blank_story()
        story.beats[0].image_url = "https://images.test/existing.jpg"
        active = 0
        max_active = 0
        call_count = 0

        async def fake_generate(_prompt: str, idempotency_key: str | None = None) -> str:
            nonlocal active, max_active, call_count
            self.assertIsNone(idempotency_key)
            active += 1
            call_count += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.005)
            active -= 1
            return f"https://images.test/{call_count}.jpg"

        original_provider = settings.image_provider
        original_concurrency = settings.image_job_concurrency
        settings.image_provider = "relay"
        settings.image_job_concurrency = 6
        try:
            with patch.object(image_generator, "_gen", side_effect=fake_generate):
                updated = asyncio.run(image_generator.generate_indigo_images(story))
        finally:
            settings.image_provider = original_provider
            settings.image_job_concurrency = original_concurrency

        self.assertEqual(call_count, 23)
        self.assertGreater(max_active, 1)
        self.assertLessEqual(max_active, 6)
        self.assertEqual(updated.beats[0].image_url, "https://images.test/existing.jpg")


class ImageJobApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        auth.init_auth_store()
        self.client = TestClient(app)
        self.store = image_jobs.SqliteImageJobStore(Path(self.temp_dir.name) / "jobs.db")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _register(self) -> tuple[str, str]:
        email = f"image-job-{uuid4().hex}@example.com"
        response = self.client.post(
            "/api/auth/register",
            json={"email": email, "password": "password123"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        return payload["user"]["id"], payload["token"]

    def test_job_is_accepted_scoped_and_cancelled(self) -> None:
        _user_id, token = self._register()
        _other_user_id, other_token = self._register()

        def fake_enqueue(_job_id: str, targets: list[str]) -> list[str]:
            return targets

        def fake_revoke(job_id: str) -> None:
            self.store.request_cancel(job_id)

        with (
            patch.object(routes.image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(routes.image_job_runner, "enqueue_image_job", side_effect=fake_enqueue),
            patch.object(routes.image_job_runner, "revoke_image_job", side_effect=fake_revoke),
        ):
            created = self.client.post(
                "/api/indigo/image-jobs",
                headers={"Authorization": f"Bearer {token}"},
                json={"story_unit": _blank_story().model_dump(mode="json")},
            )
            self.assertEqual(created.status_code, 202, created.text)
            job_id = created.json()["id"]

            status_response = self.client.get(
                f"/api/indigo/image-jobs/{job_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(status_response.status_code, 200, status_response.text)

            cross_user = self.client.get(
                f"/api/indigo/image-jobs/{job_id}",
                headers={"Authorization": f"Bearer {other_token}"},
            )
            self.assertEqual(cross_user.status_code, 404)

            cancelled = self.client.delete(
                f"/api/indigo/image-jobs/{job_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(cancelled.status_code, 200, cancelled.text)
            self.assertEqual(cancelled.json()["status"], "cancelled")

    def test_job_id_is_saved_to_linked_history(self) -> None:
        user_id, token = self._register()
        story = _blank_story()
        history = auth.create_history(
            user_id=user_id,
            mode="guided",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )

        def fake_enqueue(_job_id: str, targets: list[str]) -> list[str]:
            return targets

        with (
            patch.object(routes.image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(routes.image_job_runner, "enqueue_image_job", side_effect=fake_enqueue),
        ):
            created = self.client.post(
                "/api/indigo/image-jobs",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "story_unit": story.model_dump(mode="json"),
                    "history_id": history["id"],
                },
            )

        self.assertEqual(created.status_code, 202, created.text)
        job_id = created.json()["id"]
        saved = auth.get_history(user_id, history["id"])
        self.assertEqual(saved["story"]["image_job_id"], job_id)

    def test_job_completes_asynchronously_without_external_queue(self) -> None:
        _user_id, token = self._register()

        with (
            patch.object(image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(
                image_generator,
                "generate_indigo_single_image",
                new=AsyncMock(return_value="data:image/png;base64,ignored"),
            ),
            patch.object(
                image_assets,
                "persist_image",
                return_value="https://backend.example.test/api/indigo/image-assets/test-image.jpg",
            ),
        ):
            created = self.client.post(
                "/api/indigo/image-jobs",
                headers={"Authorization": f"Bearer {token}"},
                json={"story_unit": _blank_story().model_dump(mode="json")},
            )
            self.assertEqual(created.status_code, 202, created.text)
            job_id = created.json()["id"]

            deadline = time.monotonic() + 3
            latest = created
            while time.monotonic() < deadline:
                latest = self.client.get(
                    f"/api/indigo/image-jobs/{job_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(latest.status_code, 200, latest.text)
                if latest.json()["status"] == "completed":
                    break
                time.sleep(0.02)

        self.assertEqual(latest.json()["status"], "completed")
        self.assertEqual(latest.json()["completed"], 24)

    def test_fast_text_creates_fast_history_without_waiting_for_images(self) -> None:
        user_id, token = self._register()
        story = _blank_story()

        with (
            patch.object(
                routes.indigo_generator,
                "generate_indigo",
                new=AsyncMock(return_value=story),
            ),
            patch.object(
                routes.image_generator,
                "generate_indigo_images",
                new=AsyncMock(),
            ) as generate_images,
        ):
            response = self.client.post(
                "/api/indigo/generate-fast-text",
                headers={"Authorization": f"Bearer {token}"},
                json={"city": story.city, "district": story.district},
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["history_id"])
        self.assertIsNone(payload["image_job_id"])
        generate_images.assert_not_awaited()
        history = auth.get_history(user_id, payload["history_id"])
        self.assertEqual(history["mode"], "fast")

    def test_provider_auth_error_is_user_friendly(self) -> None:
        request = image_generator.httpx.Request("POST", "https://images.test/generate")
        response = image_generator.httpx.Response(401, request=request)
        error = image_generator.httpx.HTTPStatusError(
            "raw provider response",
            request=request,
            response=response,
        )

        self.assertEqual(
            image_generator.image_error_message(error),
            "图片服务认证失败，请检查服务端凭据",
        )


if __name__ == "__main__":
    unittest.main()
