import json
import time
import httpx
from fastapi import HTTPException
from app.core.config import settings


async def send_card(card: dict) -> None:
    """Send a card to the group via the inbound webhook (no app credentials needed)."""
    if not settings.feishu_webhook_url:
        raise HTTPException(status_code=500, detail="FEISHU_WEBHOOK_URL not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.post(settings.feishu_webhook_url, json=card, timeout=10)
        resp.raise_for_status()


_token_cache: dict = {"token": "", "expire_at": 0.0}


async def get_tenant_access_token() -> str:
    if _token_cache["token"] and _token_cache["expire_at"] > time.time() + 60:
        return _token_cache["token"]
    if not settings.feishu_app_id or not settings.feishu_app_secret:
        raise HTTPException(status_code=500, detail="Feishu app credentials not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.feishu_api_base}/auth/v3/tenant_access_token_internal",
            json={"app_id": settings.feishu_app_id, "app_secret": settings.feishu_app_secret},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    if data.get("code") != 0:
        raise HTTPException(status_code=500, detail=f"feishu token error: {data}")
    _token_cache["token"] = data["tenant_access_token"]
    _token_cache["expire_at"] = time.time() + data.get("expire", 7200)
    return _token_cache["token"]


async def send_message_to_chat(chat_id: str, msg_type: str, content: dict) -> dict:
    token = await get_tenant_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.feishu_api_base}/im/v1/messages",
            params={"receive_id_type": "chat_id"},
            headers={"Authorization": f"Bearer {token}"},
            json={
                "receive_id": chat_id,
                "msg_type": msg_type,
                "content": json.dumps(content, ensure_ascii=False),
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


async def reply_to_message(message_id: str, msg_type: str, content: dict) -> dict:
    token = await get_tenant_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.feishu_api_base}/im/v1/messages/{message_id}/reply",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "msg_type": msg_type,
                "content": json.dumps(content, ensure_ascii=False),
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


async def upload_chat_file(file_name: str, data: bytes, file_type: str = "stream") -> str:
    token = await get_tenant_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.feishu_api_base}/im/v1/files",
            headers={"Authorization": f"Bearer {token}"},
            data={"file_type": file_type, "file_name": file_name},
            files={"file": (file_name, data, "application/octet-stream")},
            timeout=60,
        )
        resp.raise_for_status()
        body = resp.json()
    if body.get("code") != 0:
        raise HTTPException(status_code=500, detail=f"feishu upload error: {body}")
    return body["data"]["file_key"]
