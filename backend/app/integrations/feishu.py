import httpx
from fastapi import HTTPException
from app.core.config import settings


async def send_card(card: dict) -> None:
    if not settings.feishu_webhook_url:
        raise HTTPException(status_code=500, detail="FEISHU_WEBHOOK_URL not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.post(settings.feishu_webhook_url, json=card, timeout=10)
        resp.raise_for_status()
