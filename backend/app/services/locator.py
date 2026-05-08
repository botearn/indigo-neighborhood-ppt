import json
import httpx
from openai import OpenAI
from app.core.config import settings
from app.core.models import (
    ConversationMessage,
    LocateRequest,
    LocateResponse,
    LocationCandidate,
)


SYSTEM_PROMPT = """你是 Hotel Indigo PPT 工具的选址助手。用户在 step 1，需要给你一个**具体的城市 + 街区/地址**作为这次 PPT 的素材；过程可以聊，但落点必须是 Mapbox 能验证的具体地点。

工具：
- `geocode_place(query)`：查 Mapbox。返回 {city, neighborhood, display, lng, lat} 或 null。

什么时候调 geocode_place：
- 用户给了具体街区/地址（"上海武康路"、"成都玉林"、"北京南锣鼓巷"）→ 调
- 用户绕弯但你能从世界知识推断出具体街区（"驴打滚是哪里的特色"→可推断北京老城区，比如「北京 南锣鼓巷」或「北京 鼓楼」；"张爱玲住过的地方"→「上海 常德路」）→ 推断后调
- 用户只给到省/国家（"四川"、"中国"、"南方"）→ **不要调**，先问哪个城市
- 用户只给到城市（"北京"、"上海"）→ **不要调**，先问哪个街区
- 用户问无关问题（"今天天气"、"你是谁"）→ **不要调**，温和说明你只帮选地点

geocode 命中之后再判断它是否真的匹配用户意图。比如用户说"四川"，你不该调 geocode；如果不小心调了拿到一条「香港四川街」，那就明确告诉用户这不是他要的，让他给具体城市。

回复风格：节制、有人味、3 句以内。中文（除非用户用英文）。语气参考汪曾祺写街区——具体、不煽情。

最终输出严格 JSON：
{
  "reply": "<给用户看的中文回复>",
  "candidate_display": null 或 "<之前 geocode_place 命中过的、你确认要采用的那条 display 字符串原文>"
}

候选必须是之前 geocode_place 实际返回过的 display；不要自造。如果 geocode 失败、太宽泛、或不匹配用户意图，candidate_display 必须为 null。"""


GEOCODE_TOOL = {
    "type": "function",
    "function": {
        "name": "geocode_place",
        "description": "用 Mapbox 验证一个具体的城市+街区/地址。仅在用户表达足够具体（含街区或地址）或你能从对话明确推断出具体街区时调用。不要拿省、国家、单独的市名调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "要查询的具体地名，应包含城市和街区/地址（例如 '上海 武康路' 或 '北京 南锣鼓巷'）",
                }
            },
            "required": ["query"],
        },
    },
}


async def _mapbox_geocode(query: str) -> dict | None:
    if not settings.mapbox_token or not query.strip():
        return None
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"
    params = {
        "access_token": settings.mapbox_token,
        "language": "zh",
        "limit": 1,
        "types": "neighborhood,locality,place,district,address,poi",
    }
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.get(url, params=params)
    if resp.status_code != 200:
        return None
    data = resp.json()
    features = data.get("features") or []
    if not features:
        return None
    f0 = features[0]
    if f0.get("relevance", 0) < 0.5:
        return None
    lng, lat = f0["center"]
    city = ""
    neighborhood = ""
    for f in features:
        ptype = (f.get("place_type") or [None])[0]
        if ptype == "place" and not city:
            city = f.get("text", "")
        if ptype in ("neighborhood", "locality", "district") and not neighborhood:
            neighborhood = f.get("text", "")
    if not city:
        for ctx in f0.get("context") or []:
            if ctx.get("id", "").startswith("place"):
                city = ctx.get("text", "")
                break
        if not city:
            city = f0.get("text", "")
    if not neighborhood:
        neighborhood = f0.get("text", "")
    return {
        "city": city,
        "neighborhood": neighborhood,
        "display": f0.get("place_name", ""),
        "longitude": lng,
        "latitude": lat,
    }


def _client() -> OpenAI:
    if settings.llm_provider == "deepseek":
        return OpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
    return OpenAI(api_key=settings.openai_api_key)


def _model() -> str:
    if settings.llm_provider == "deepseek":
        return "deepseek-chat"
    return "gpt-4o-mini"


def _format_history(history: list[ConversationMessage] | None) -> list[dict]:
    if not history:
        return []
    out: list[dict] = []
    for m in history[-12:]:
        if m.step is not None and m.step != 1:
            continue
        role = "user" if m.role == "user" else "assistant"
        out.append({"role": role, "content": m.content})
    return out


async def locate(req: LocateRequest) -> LocateResponse:
    client = _client()
    model = _model()

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(_format_history(req.conversation_history))
    messages.append({"role": "user", "content": req.input})

    geocoded: dict[str, dict] = {}

    for _ in range(4):
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=[GEOCODE_TOOL],
            response_format={"type": "json_object"},
        )
        msg = resp.choices[0].message
        if msg.tool_calls:
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            })
            for tc in msg.tool_calls:
                if tc.function.name != "geocode_place":
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": "null",
                    })
                    continue
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                q = (args.get("query") or "").strip()
                result = await _mapbox_geocode(q) if q else None
                if result:
                    geocoded[result["display"]] = result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False) if result else "null",
                })
            continue

        # No tool calls — parse final JSON.
        raw = msg.content or "{}"
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return LocateResponse(reply=raw or "嗯？再说一次？", candidate=None)
        reply = parsed.get("reply") or "嗯？再说一次？"
        cand_display = parsed.get("candidate_display")
        candidate = None
        if isinstance(cand_display, str) and cand_display in geocoded:
            candidate = LocationCandidate(**geocoded[cand_display])
        return LocateResponse(reply=reply, candidate=candidate)

    return LocateResponse(reply="想得有点多 — 再说一次具体位置？", candidate=None)
