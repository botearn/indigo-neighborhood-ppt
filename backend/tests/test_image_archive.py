import io
import sys
import unittest
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.image_archive import build_indigo_image_archive  # noqa: E402
from tests.test_indigo_pptx_images import _story  # noqa: E402


class IndigoImageArchiveTest(unittest.TestCase):
    def test_archive_contains_all_24_images_grouped_by_beat(self) -> None:
        archive = build_indigo_image_archive(_story())

        with ZipFile(io.BytesIO(archive)) as output:
            names = output.namelist()
            self.assertEqual(len(names), 24)
            self.assertEqual(
                names[:4],
                [
                    "01_空间1/main.png",
                    "01_空间1/mood.png",
                    "01_空间1/design.png",
                    "01_空间1/detail.png",
                ],
            )
            self.assertTrue(all(output.read(name) for name in names))

    def test_archive_requires_all_24_images(self) -> None:
        story = _story()
        story.beats[0].image_url = None

        with self.assertRaisesRegex(ValueError, "当前 23 / 24"):
            build_indigo_image_archive(story)

    def test_export_route_is_authenticated_and_returns_zip(self) -> None:
        client = TestClient(app)
        story = _story().model_dump(mode="json")

        unauthenticated = client.post("/api/indigo/export-images", json=story)
        self.assertEqual(unauthenticated.status_code, 401)

        registered = client.post(
            "/api/auth/register",
            json={
                "email": f"archive-{uuid4().hex}@example.com",
                "password": "password123",
            },
        )
        self.assertEqual(registered.status_code, 200, registered.text)
        token = registered.json()["token"]

        response = client.post(
            "/api/indigo/export-images",
            headers={"Authorization": f"Bearer {token}"},
            json=story,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/zip")
        self.assertIn("filename*=UTF-8''", response.headers["content-disposition"])
        with ZipFile(io.BytesIO(response.content)) as output:
            self.assertEqual(len(output.namelist()), 24)


if __name__ == "__main__":
    unittest.main()
