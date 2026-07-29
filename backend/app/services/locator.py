import json
import re
from urllib.parse import quote

import httpx
from openai import OpenAI
from app.core.config import settings
from app.core.models import (
    ConversationMessage,
    LocateRequest,
    LocateResponse,
    LocationCandidate,
)


class GeocodeProviderError(RuntimeError):
    pass


CITY_NAMES = (
    "上海",
    "北京",
    "成都",
    "广州",
    "深圳",
    "杭州",
    "苏州",
    "南京",
    "西安",
    "重庆",
    "武汉",
    "厦门",
    "长沙",
    "青岛",
    "太原",
    "天津",
    "宁波",
    "福州",
    "昆明",
    "大理",
    "郑州",
    "洛阳",
    "济南",
    "合肥",
    "南昌",
    "贵阳",
    "海口",
    "三亚",
    "乌鲁木齐",
)

LOCATION_STOPWORDS = {
    "哪里",
    "哪个",
    "这边",
    "这里",
    "那边",
    "那里",
    "附近",
    "一个",
    "几个",
    "地段",
    "地方",
    "区域",
    "范围",
    "太大",
    "兴趣",
    "有兴趣",
}


SYSTEM_PROMPT = """你是 Hotel Indigo PPT 工具的选址助手。用户在 step 1，需要给你一个**具体的城市 + 街区/地址**作为这次 PPT 的素材；过程可以聊，但落点必须是 geocode_place 工具实际查到的真实地点。

你有两个工具：
1. `geocode_place(query)`：查地名。返回 {city, neighborhood, display, longitude, latitude} 或 null。
2. `confirm_place(display)`：把之前 geocode_place 命中过的某条候选锁定为最终落点。display 必须严格等于之前 geocode_place 真实返回过的字符串原文。

绝对禁令：
- **永远不要对用户提到「Mapbox」、「geocode」、「数据库」、「收录」这种实现细节**。用户只关心地点。
- **geocode_place 返回 null 时，绝不要反问"要确认 X 作为落点吗"——没查到就是没查到，confirm_place 必须建立在 geocode 命中之上**。
- **不要假装已经查过**。说"我搜不到"就直接说，不要编造结果。

什么时候调 geocode_place：
- 用户给了具体街区/地址（"上海武康路"、"成都玉林"、"北京南锣鼓巷"、"太原钟楼街"）→ 调
- 用户绕弯但你能从世界知识推断出具体街区（"驴打滚是哪里的特色"→推断「北京 南锣鼓巷」；"张爱玲住过的地方"→「上海 常德路」）→ 推断后调
- 用户只给到省/国家（"四川"、"中国"、"南方"）→ **不要调**，先问哪个城市
- 用户只给到城市（"北京"、"上海"、"太原"）→ **不要调**，先问哪个街区
- 用户问无关问题（"今天天气"、"你是谁"）→ **不要调**，温和说明你只帮选地点

geocode_place 失败时的处理：
- 第一次 null → 用不同写法再试一次（比如换城市前后顺序、加"市"字、换关键词）。最多两次。
- 两次都 null → 直接告诉用户"我这边搜不到这个名字，换一个地标试试？"，并基于你对这个城市的世界知识**主动建议 2-3 个具体的同类地标**。比如太原老城类的：食品街、五一广场、迎泽公园、晋祠、双塔寺。
- **不要**反复试同一个或近似的查询。**不要**在用户没确认情况下自作主张去调用其他城市的查询。

什么时候调 confirm_place：
- 仅当 geocode_place 真实命中过、且你判断结果匹配用户意图时
- 用户明确说"对就这个"/"可以"/"用这个" 且你之前确实有 geocode 命中 → confirm 那条命中过的 display
- 用户说"对就这个" 但你**没有任何 geocode 命中** → 不要 confirm；告诉用户你没搜到，请换一个地标
- 不匹配（比如"四川"误中了"香港四川街"）→ 不要 confirm

回复风格：节制、有人味、3 句以内。中文。语气参考汪曾祺写街区——具体、不煽情。

**格式铁律（违反即错）**：
- 你的回复文本里绝对不能出现花括号 `{` `}`、JSON 键值对、工具调用的参数或返回值的任何片段。
- 工具的输入和输出只在你内部使用，**绝对不能粘贴进回复文本**。
- 回复就是纯粹的中文口语句子，不要 JSON，不要 markdown，不要代码块。"""


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


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        clean = item.strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        out.append(clean)
    return out


def _normalize_city(name: str) -> str:
    clean = name.strip()
    if clean.endswith("市") and len(clean) > 2:
        clean = clean[:-1]
    return clean


def _looks_like_location_term(term: str) -> bool:
    clean = term.strip()
    if not (2 <= len(clean) <= 12):
        return False
    if clean in LOCATION_STOPWORDS:
        return False
    if not re.search(r"[\u4e00-\u9fffA-Za-z]", clean):
        return False
    return True


def _extract_location_context(history: list[ConversationMessage] | None) -> list[str]:
    if not history:
        return []

    terms: list[str] = []
    user_texts = [
        m.content
        for m in history[-12:]
        if (m.step is None or m.step == 1) and m.role == "user"
    ]
    for text in user_texts:
        for city in CITY_NAMES:
            if city in text:
                terms.append(city)
                after = text.split(city, 1)[1]
                suffix = re.match(r"[\s,，、:：-]*([\u4e00-\u9fffA-Za-z0-9·]{2,8})", after)
                if suffix and _looks_like_location_term(suffix.group(1)):
                    terms.append(suffix.group(1))

        for token in re.split(r"[\s,，、。！？!?;；:：()（）\"'“”]+", text):
            token = token.strip()
            if _looks_like_location_term(token):
                terms.append(token)

        for match in re.findall(
            r"([\u4e00-\u9fffA-Za-z0-9·]{2,12}(?:区|县|镇|街道|街|路|巷|里|村|山|湖|河|湾|寺|园|宫|门|桥|坊|场|站|店|城|弄|道))",
            text,
        ):
            if _looks_like_location_term(match):
                terms.append(match)

    return _unique(terms)[-4:]


def _contextual_queries(query: str, history: list[ConversationMessage] | None) -> list[str]:
    base = re.sub(r"\s+", " ", query).strip()
    if not base:
        return []

    context = [term for term in _extract_location_context(history) if term not in base]
    queries: list[str] = []
    if context:
        joined = " ".join(context)
        queries.extend([
            f"{joined} {base}",
            f"{base} {joined}",
            f"{base}, {', '.join(reversed(context))}, 中国",
        ])
    queries.append(base)
    return _unique(queries)


def _context_value(feature: dict, prefix: str) -> str:
    for ctx in feature.get("context") or []:
        if ctx.get("id", "").startswith(prefix):
            return ctx.get("text", "")
    return ""


def _mapbox_feature_to_candidate(feature: dict) -> dict | None:
    center = feature.get("center")
    if not center or len(center) < 2:
        return None

    place_type = (feature.get("place_type") or [""])[0]
    text = feature.get("text", "")
    region = _context_value(feature, "region")
    city = _context_value(feature, "place")
    if not city and region.endswith("市"):
        city = region
    if not city:
        city = text if place_type == "place" else region

    neighborhood = text
    if place_type in ("country", "region", "place", "district"):
        neighborhood = (
            _context_value(feature, "neighborhood")
            or _context_value(feature, "locality")
            or text
        )

    return {
        "city": _normalize_city(city),
        "neighborhood": neighborhood.strip(),
        "display": feature.get("place_name", ""),
        "longitude": center[0],
        "latitude": center[1],
    }


async def _mapbox_geocode(query: str) -> dict | None:
    if not query.strip():
        return None
    if not settings.mapbox_token:
        raise GeocodeProviderError("MAPBOX_TOKEN is not configured")
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(query)}.json"
    params = {
        "access_token": settings.mapbox_token,
        "language": "zh",
        "limit": 5,
    }
    if re.search(r"[\u4e00-\u9fff]", query):
        params["country"] = "cn"
    async with httpx.AsyncClient(timeout=10.0) as c:
        resp = await c.get(url, params=params)
    if resp.status_code in (401, 403):
        raise GeocodeProviderError("Mapbox geocoding token is invalid or not allowed")
    if resp.status_code != 200:
        return None
    data = resp.json()
    features = data.get("features") or []
    for f in features:
        if f.get("relevance", 0) < 0.5:
            continue
        candidate = _mapbox_feature_to_candidate(f)
        if candidate:
            return candidate
    return None


def _nominatim_item_to_candidate(item: dict) -> dict | None:
    lat = item.get("lat")
    lon = item.get("lon")
    if lat is None or lon is None:
        return None

    address = item.get("address") or {}
    city = (
        address.get("city")
        or address.get("municipality")
        or address.get("town")
        or address.get("county")
        or ""
    )
    state = address.get("state") or ""
    if (not city or city.endswith(("区", "县"))) and state:
        city = state

    neighborhood = (
        address.get("road")
        or address.get("neighbourhood")
        or address.get("suburb")
        or address.get("quarter")
        or address.get("city_district")
        or item.get("name")
        or (item.get("display_name", "").split(",")[0])
        or ""
    )

    return {
        "city": _normalize_city(city),
        "neighborhood": neighborhood.strip(),
        "display": item.get("display_name", ""),
        "longitude": float(lon),
        "latitude": float(lat),
    }


async def _nominatim_geocode(query: str) -> dict | None:
    if not query.strip():
        return None
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 5,
        "accept-language": "zh-CN,zh,en",
        "addressdetails": 1,
    }
    if re.search(r"[\u4e00-\u9fff]", query):
        params["countrycodes"] = "cn"
    headers = {"User-Agent": "indigo-neighborhood-ppt-demo/1.0"}
    async with httpx.AsyncClient(timeout=12.0, headers=headers) as c:
        resp = await c.get("https://nominatim.openstreetmap.org/search", params=params)
    if resp.status_code != 200:
        return None
    for item in resp.json() or []:
        candidate = _nominatim_item_to_candidate(item)
        if candidate:
            return candidate
    return None


async def _geocode_place(query: str, history: list[ConversationMessage] | None) -> dict | None:
    for q in _contextual_queries(query, history):
        try:
            result = await _mapbox_geocode(q)
        except GeocodeProviderError:
            result = None
        if result:
            return result

        fallback = await _nominatim_geocode(q)
        if fallback:
            return fallback
    return None


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
    latest_geocoded: dict | None = None

    for _ in range(5):
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            reply = (msg.content or "").strip() or "嗯？再说一次？"
            candidate_data = committed or latest_geocoded
            candidate = LocationCandidate(**candidate_data) if candidate_data else None
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
                result = await _geocode_place(q, req.conversation_history) if q else None
                if result:
                    geocoded[result["display"]] = result
                    latest_geocoded = result
                content = json.dumps(result, ensure_ascii=False) if result else "null"
            elif name == "confirm_place":
                display = (args.get("display") or "").strip()
                if display in geocoded:
                    committed = geocoded[display]
                    content = json.dumps({"ok": True}, ensure_ascii=False)
                else:
                    # display may come from a previous conversation turn; try to recover via geocode
                    recovered = await _geocode_place(display, req.conversation_history) if display else None
                    if recovered:
                        geocoded[recovered["display"]] = recovered
                        latest_geocoded = recovered
                        committed = recovered
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

    candidate_data = committed or latest_geocoded
    candidate = LocationCandidate(**candidate_data) if candidate_data else None
    return LocateResponse(
        reply="想得有点多 — 再说一次具体位置？",
        candidate=candidate,
    )
