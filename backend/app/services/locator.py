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


SYSTEM_PROMPT = """你是 Hotel Indigo PPT 工具的选址助手。用户在 step 1，需要给你一个**具体的城市 + 街区/地址**作为这次 PPT 的素材；过程可以聊，但落点必须是 Mapbox 能验证过的具体地点。

你有两个工具：
1. `geocode_place(query)`：调 Mapbox 查地名。返回 {city, neighborhood, display, longitude, latitude} 或 null。
2. `confirm_place(display)`：把之前 geocode_place 命中过的某条候选确认为本次的最终落点。display 必须严格等于之前 geocode_place 真实返回过的 display 字符串原文。

什么时候调 geocode_place：
- 用户给了具体街区/地址（"上海武康路"、"成都玉林"、"北京南锣鼓巷"）→ 调
- 用户绕弯但你能从世界知识推断出具体街区（"驴打滚是哪里的特色"→可推断北京老城区，比如「北京 南锣鼓巷」或「北京 鼓楼」；"张爱玲住过的地方"→「上海 常德路」）→ 推断后调
- 用户只给到省/国家（"四川"、"中国"、"南方"）→ **不要调**，先问哪个城市
- 用户只给到城市（"北京"、"上海"）→ **不要调**，先问哪个街区
- 用户问无关问题（"今天天气"、"你是谁"）→ **不要调**，温和说明你只帮选地点

什么时候调 confirm_place：
- 仅当 geocode_place 命中、且你判断结果真的匹配用户意图时
- 不匹配（比如"四川"误中了"香港四川街"）→ 不要 confirm，转而问用户具体哪个城市

正确流程示例：
- 用户："上海武康路" → geocode_place("上海 武康路") → 命中 → confirm_place("上海市 徐汇区 武康路") → 回："上海徐汇的武康路，行。"
- 用户："驴打滚是哪里的特色" → geocode_place("北京 南锣鼓巷") → 命中 → confirm_place(display) → 回："驴打滚是老北京小吃。要去南锣鼓巷？"
- 用户："四川" → 不调 geocode → 回："四川挺大的 — 哪个城市？成都、绵阳、自贡？"
- 用户："今天天气怎么样" → 不调 geocode → 回："我这步只帮你选地点。说一个城市加街区？比如「成都 玉林」。"

回复风格：节制、有人味、3 句以内。中文（除非用户用英文）。语气参考汪曾祺写街区——具体、不煽情。

回复内容就是普通的中文文本，不要 JSON、不要 markdown。所有"确认候选"的动作都通过 confirm_place 工具完成，不要在文字里写"已确认"之类的元说明。"""


TOOLS = [
    {
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
    },
    {
        "type": "function",
        "function": {
            "name": "confirm_place",
            "description": "把之前 geocode_place 命中过的某条结果确认为最终落点。仅当 geocode 命中且你判断结果真的匹配用户意图时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "display": {
                        "type": "string",
                        "description": "之前 geocode_place 实际返回过的某条 display 字符串原文。必须严格匹配。",
                    }
                },
                "required": ["display"],
            },
        },
    },
]


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
    committed: dict | None = None

    for _ in range(5):
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            reply = (msg.content or "").strip() or "嗯？再说一次？"
            candidate = LocationCandidate(**committed) if committed else None
            return LocateResponse(reply=reply, candidate=candidate)

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
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
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            if name == "geocode_place":
                q = (args.get("query") or "").strip()
                result = await _mapbox_geocode(q) if q else None
                if result:
                    geocoded[result["display"]] = result
                content = json.dumps(result, ensure_ascii=False) if result else "null"
            elif name == "confirm_place":
                display = (args.get("display") or "").strip()
                if display in geocoded:
                    committed = geocoded[display]
                    content = json.dumps({"ok": True}, ensure_ascii=False)
                else:
                    content = json.dumps(
                        {"ok": False, "error": "display 必须是之前 geocode_place 实际返回过的字符串"},
                        ensure_ascii=False,
                    )
            else:
                content = json.dumps({"error": f"unknown tool {name}"}, ensure_ascii=False)

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": content,
            })

    candidate = LocationCandidate(**committed) if committed else None
    return LocateResponse(
        reply="想得有点多 — 再说一次具体位置？",
        candidate=candidate,
    )
