import asyncio
import sys
import unittest
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.api import routes  # noqa: E402
from app.core import auth  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services import image_generator, image_jobs  # noqa: E402
from tests.test_indigo_pptx_images import _story  # noqa: E402


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = defaultdict(dict)

    def hset(self, name: str, mapping: dict | None = None, **_kwargs) -> int:
        values = mapping or {}
        self.hashes[name].update({str(key): str(value) for key, value in values.items()})
        return len(values)

    def hgetall(self, name: str) -> dict[str, str]:
        return dict(self.hashes.get(name, {}))

    def hdel(self, name: str, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self.hashes.get(name, {}):
                del self.hashes[name][key]
                removed += 1
        return removed

    def expire(self, _name: str, _ttl: int) -> bool:
        return True


def _blank_story():
    story = _story()
    for beat in story.beats:
        for image_field in image_jobs.IMAGE_FIELDS:
            setattr(beat, image_field, None)
    return story


class ImageJobStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = image_jobs.RedisImageJobStore(FakeRedis())

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

    def test_existing_images_are_not_enqueued_again(self) -> None:
        story = _blank_story()
        story.beats[0].image_url = "https://images.test/existing.jpg"

        job = self.store.create(user_id="user-1", story=story)

        self.assertEqual(job.completed, 1)
        self.assertEqual(len(self.store.pending_targets(job.id)), 23)


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
        self.client = TestClient(app)
        self.store = image_jobs.RedisImageJobStore(FakeRedis())

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

        def fake_enqueue(job_id: str, targets: list[str]) -> list[str]:
            task_ids = [f"task-{index}" for index, _target in enumerate(targets)]
            self.store.set_task_ids(job_id, task_ids)
            return task_ids

        def fake_revoke(job_id: str) -> None:
            self.store.request_cancel(job_id)

        with (
            patch.object(routes.image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(routes.worker, "enqueue_image_job", side_effect=fake_enqueue),
            patch.object(routes.worker, "revoke_image_job", side_effect=fake_revoke),
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

        def fake_enqueue(job_id: str, targets: list[str]) -> list[str]:
            task_ids = [f"task-{index}" for index, _target in enumerate(targets)]
            self.store.set_task_ids(job_id, task_ids)
            return task_ids

        with (
            patch.object(routes.image_jobs, "get_image_job_store", return_value=self.store),
            patch.object(routes.worker, "enqueue_image_job", side_effect=fake_enqueue),
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


if __name__ == "__main__":
    unittest.main()
