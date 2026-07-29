import json
import logging
import re
import traceback
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from openai import OpenAI
from app.core.config import settings
from app.core.models import GenerateRequest
from app.integrations.feishu import (
    reply_to_message,
    send_message_to_chat,
    upload_chat_file,
)
from app.services import generator, image_generator, ppt_builder

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook")

_processed_event_ids: set[str] = set()


def _parse_request_text(raw_text: str, mentions: list) -> str:
    """Strip @bot placeholders from message text."""
    text = raw_text or ""
    for m in mentions or []:
        key = m.get("key", "")
        if key:
            text = text.replace(key, "")
    return text.strip()


def _heuristic_parse(text: str) -> tuple[str, str] | None:
    """Best-effort fallback parser, no LLM."""
    cities = ["北京", "上海", "广州", "深圳", "成都", "杭州", "南京", "苏州", "西安", "重庆", "武汉", "天津", "厦门", "青岛", "长沙", "郑州"]
    for c in cities:
        if c in text:
            rest = text.replace(c, "").strip()
            rest = re.sub(r"[的，。!？?,.\s]+", "", rest)
            rest = re.sub(r"^(帮我|请|做|生成|来一个|一个|做个|做一个)", "", rest)
            rest = rest.strip()
            if rest:
                return c, rest
    return None


async def _llm_parse_neighborhood(text: str) -> tuple[str, str]:
    """Use LLM to extract city + neighborhood from free-form Chinese."""
    if settings.llm_provider == "deepseek":
        client = OpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
        model = "deepseek-chat"
    else:
        client = OpenAI(api_key=settings.openai_api_key)
        model = "gpt-4o-mini"

    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "从用户消息里提取城市和街区/社区/商圈名。"
                    "返回严格 JSON：{\"city\": \"...\", \"neighborhood\": \"...\"}。"
                    "如果用户只给了一个地名（比如「王府井」），city 留空字符串。"
                    "如果完全无法识别地名，返回 {\"city\": \"\", \"neighborhood\": \"\"}。"
                ),
            },
            {"role": "user", "content": text},
        ],
    )
    raw = resp.choices[0].message.content or "{}"
    data = json.loads(raw)
    return data.get("city", "").strip(), data.get("neighborhood", "").strip()


async def _generate_and_send(chat_id: str, city: str, neighborhood: str, message_id: str):
    try:
        await reply_to_message(
            message_id,
            "text",
            {"text": f"收到 ✅ 正在为 {city}·{neighborhood} 生成 PPT，约 1 分钟……"},
        )

        story = await generator.generate_story_unit(GenerateRequest(city=city, neighborhood=neighborhood))
        story = await image_generator.generate_images(story)
        pptx_bytes = ppt_builder.build_ppt_from_story(story)

        file_name = f"{neighborhood}_{city}.pptx"
        file_key = await upload_chat_file(file_name, pptx_bytes, file_type="stream")

        await send_message_to_chat(chat_id, "file", {"file_key": file_key})
    except Exception as e:
        logger.error("PPT generation failed: %s\n%s", e, traceback.format_exc())
        try:
            await send_message_to_chat(
                chat_id,
                "text",
                {"text": f"生成失败 ❌\n{type(e).__name__}: {str(e)[:300]}"},
            )
        except Exception:
            pass


@router.post("/feishu")
async def feishu_event(request: Request, background: BackgroundTasks):
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid JSON")

    # URL verification handshake
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    # Verification token check (legacy v1) or schema 2.0 has no top-level token
    token = payload.get("token") or payload.get("header", {}).get("token", "")
    if settings.feishu_verification_token and token and token != settings.feishu_verification_token:
        raise HTTPException(status_code=401, detail="invalid token")

    header = payload.get("header") or {}
    event_type = header.get("event_type") or payload.get("event", {}).get("type", "")
    event_id = header.get("event_id", "")

    if event_id and event_id in _processed_event_ids:
        return {"status": "duplicate"}
    if event_id:
        _processed_event_ids.add(event_id)
        if len(_processed_event_ids) > 1000:
            _processed_event_ids.clear()

    if event_type != "im.message.receive_v1":
        return {"status": "ignored"}

    event = payload.get("event", {})
    message = event.get("message", {})
    chat_id = message.get("chat_id", "")
    message_id = message.get("message_id", "")
    msg_type = message.get("message_type", "")

    if msg_type != "text" or not chat_id:
        return {"status": "ignored"}

    try:
        text_obj = json.loads(message.get("content", "{}"))
        raw_text = text_obj.get("text", "")
    except json.JSONDecodeError:
        raw_text = ""

    text = _parse_request_text(raw_text, message.get("mentions", []))
    if not text:
        return {"status": "empty"}

    # Try heuristic first (instant), fall back to LLM
    parsed = _heuristic_parse(text)
    if parsed:
        city, neighborhood = parsed
    else:
        try:
            city, neighborhood = await _llm_parse_neighborhood(text)
        except Exception as e:
            logger.error("LLM parse failed: %s", e)
            await reply_to_message(
                message_id,
                "text",
                {"text": "没看懂，请告诉我「城市 + 街区」，比如「北京 王府井」"},
            )
            return {"status": "parse_failed"}

    if not neighborhood:
        await reply_to_message(
            message_id,
            "text",
            {"text": "没识别到具体街区。试试「上海 武康路」「北京 王府井」这样的格式 🙂"},
        )
        return {"status": "no_neighborhood"}

    if not city:
        city = "未指定城市"

    background.add_task(_generate_and_send, chat_id, city, neighborhood, message_id)
    return {"status": "ok"}
