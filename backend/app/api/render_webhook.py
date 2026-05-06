import base64
import hashlib
import hmac
import time
import httpx
from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings
from app.integrations.feishu import send_card

router = APIRouter(prefix="/webhook")

_TOLERANCE_SECONDS = 5 * 60


def _verify_signature(webhook_id: str, timestamp: str, body: bytes, signature_header: str) -> bool:
    if not settings.render_webhook_secret:
        return True
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - ts) > _TOLERANCE_SECONDS:
        return False

    secret = settings.render_webhook_secret
    if secret.startswith("whsec_"):
        secret_bytes = base64.b64decode(secret[len("whsec_"):])
    else:
        secret_bytes = secret.encode()

    signed = f"{webhook_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()

    for part in signature_header.split(" "):
        if "," not in part:
            continue
        _, sig = part.split(",", 1)
        if hmac.compare_digest(sig, expected):
            return True
    return False


async def _fetch_event_details(event_id: str) -> dict | None:
    if not settings.render_api_key:
        return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://api.render.com/v1/events/{event_id}",
                headers={"Authorization": f"Bearer {settings.render_api_key}"},
                timeout=8,
            )
            if resp.status_code == 200:
                return resp.json()
        except httpx.HTTPError:
            return None
    return None


def _card_for_event(event_type: str, status: str, service_id: str, details: dict | None) -> dict:
    label_map = {
        "deploy_started": ("🚀 部署开始", "blue"),
        "deploy_ended": {
            "succeeded": ("✅ 部署成功", "green"),
            "failed": ("❌ 部署失败", "red"),
            "canceled": ("⚠️ 部署取消", "grey"),
        },
        "build_started": ("🔨 构建开始", "blue"),
        "build_ended": {
            "succeeded": ("✅ 构建成功", "green"),
            "failed": ("❌ 构建失败", "red"),
            "canceled": ("⚠️ 构建取消", "grey"),
        },
        "server_failed": ("🔥 服务故障", "red"),
        "server_available": ("✅ 服务恢复", "green"),
        "service_suspended": ("⏸️ 服务暂停", "grey"),
        "service_resumed": ("▶️ 服务恢复", "green"),
    }
    entry = label_map.get(event_type)
    if isinstance(entry, dict):
        title, color = entry.get(status, (f"{event_type}", "grey"))
    elif entry:
        title, color = entry
    else:
        title, color = (event_type, "grey")

    fields = [
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**Service**\n`{service_id}`"}},
    ]
    if status:
        fields.append({"is_short": True, "text": {"tag": "lark_md", "content": f"**状态**\n{status}"}})

    elements: list = [{"tag": "div", "fields": fields}]

    if details:
        ev = details.get("event", details) or {}
        commit = ev.get("details", {}).get("commitMessage") or ev.get("details", {}).get("commitShortId")
        if commit:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": f"**Commit**\n{commit}"}})
        deploy_id = ev.get("details", {}).get("deployId")
        if deploy_id:
            url = f"https://dashboard.render.com/web/{service_id}/deploys/{deploy_id}"
            elements.append({
                "tag": "action",
                "actions": [{
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "查看部署"},
                    "url": url,
                    "type": "default",
                }],
            })

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": color,
            },
            "elements": elements,
        },
    }


@router.post("/render")
async def render_webhook(request: Request):
    body = await request.body()
    webhook_id = request.headers.get("webhook-id", "")
    timestamp = request.headers.get("webhook-timestamp", "")
    signature = request.headers.get("webhook-signature", "")

    if not _verify_signature(webhook_id, timestamp, body, signature):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = await request.json()
    event_type = payload.get("type", "")
    data = payload.get("data", {}) or {}
    status = data.get("status", "")
    service_id = data.get("serviceId", "")
    event_id = data.get("id", "")

    notify_types = {
        "deploy_started", "deploy_ended",
        "server_failed", "server_available",
        "service_suspended", "service_resumed",
    }
    if event_type not in notify_types:
        return {"status": "ignored"}

    details = await _fetch_event_details(event_id) if event_id else None
    card = _card_for_event(event_type, status, service_id, details)
    await send_card(card)
    return {"status": "ok"}
