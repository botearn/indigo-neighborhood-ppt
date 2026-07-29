import os
import sys
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

_TEMP_DIR = tempfile.TemporaryDirectory()
os.environ["AUTH_DB_PATH"] = str(Path(_TEMP_DIR.name) / "auth.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.core import auth  # noqa: E402
from app.main import app  # noqa: E402


PNG_1X1_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


class AuthFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        auth.init_auth_store()
        self.client = TestClient(app)

    def _register(self, email: str | None = None) -> tuple[dict, str]:
        email = email or f"user-{uuid4().hex}@example.com"
        res = self.client.post(
            "/api/auth/register",
            json={"email": email.upper(), "password": "password123", "name": " Demo User "},
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        return data["user"], data["token"]

    def test_register_login_me_logout_flow(self) -> None:
        email = f"demo-{uuid4().hex}@example.com"
        user, token = self._register(email)

        self.assertEqual(user["email"], email)
        self.assertEqual(user["name"], "Demo User")

        me = self.client.get("/api/auth/me", headers={"Authorization": f"bearer {token}"})
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["id"], user["id"])

        bad_login = self.client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrong-password"},
        )
        self.assertEqual(bad_login.status_code, 401)

        logout = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout.status_code, 200, logout.text)

        after_logout = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(after_logout.status_code, 401)

    def test_history_is_protected_and_user_scoped(self) -> None:
        user_a, token_a = self._register()
        user_b, token_b = self._register()

        item_a = auth.create_history(
            user_id=user_a["id"],
            mode="fast",
            city="上海",
            district="新天地",
            title="上海 新天地",
            story={"city": "上海", "district": "新天地"},
        )
        item_b = auth.create_history(
            user_id=user_b["id"],
            mode="guided",
            city="成都",
            district="玉林",
            title="成都 玉林",
            story={"city": "成都", "neighborhood": "玉林"},
        )

        unauthenticated = self.client.get("/api/history")
        self.assertEqual(unauthenticated.status_code, 401)

        history_a = self.client.get("/api/history", headers={"Authorization": f"Bearer {token_a}"})
        self.assertEqual(history_a.status_code, 200, history_a.text)
        self.assertEqual([item["id"] for item in history_a.json()["items"]], [item_a["id"]])

        detail_a = self.client.get(f"/api/history/{item_a['id']}", headers={"Authorization": f"Bearer {token_a}"})
        self.assertEqual(detail_a.status_code, 200, detail_a.text)
        self.assertEqual(detail_a.json()["story"]["district"], "新天地")

        cross_user = self.client.get(f"/api/history/{item_b['id']}", headers={"Authorization": f"Bearer {token_a}"})
        self.assertEqual(cross_user.status_code, 404)

        history_b = self.client.get("/api/history", headers={"Authorization": f"Bearer {token_b}"})
        self.assertEqual([item["id"] for item in history_b.json()["items"]], [item_b["id"]])

    def test_vercel_origin_is_allowed_for_auth_preflight(self) -> None:
        res = self.client.options(
            "/api/auth/me",
            headers={
                "Origin": "https://indigo-neighborhood-ppt.vercel.app",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(
            res.headers.get("access-control-allow-origin"),
            "https://indigo-neighborhood-ppt.vercel.app",
        )
        self.assertIn("authorization", res.headers.get("access-control-allow-headers", "").lower())

    def test_export_only_accepts_rendered_slide_payload(self) -> None:
        _user, token = self._register()

        ok = self.client.post(
            "/api/export",
            headers={"Authorization": f"Bearer {token}"},
            json={"city": "上海", "neighborhood": "武康路", "slides": [PNG_1X1_DATA_URL]},
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(
            ok.headers.get("content-type"),
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )

        legacy = self.client.post(
            "/api/export",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "city": "上海",
                "neighborhood": "武康路",
                "signature": {"zh": "梧桐旧影", "en": "Plane Tree Lane"},
                "anchor": "武康路",
                "hook_line": "梧桐影里看上海",
                "beats": [],
                "action_cue": "走进武康路",
            },
        )
        self.assertEqual(legacy.status_code, 422)

    def test_legacy_feishu_ppt_webhook_is_not_registered(self) -> None:
        res = self.client.post("/webhook/feishu", json={"type": "url_verification"})
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
