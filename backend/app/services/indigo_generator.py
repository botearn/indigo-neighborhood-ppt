"""
Hotel Indigo 22-slide storyline generator.
One large LLM call → complete IndigoStoryUnit JSON.
"""
import json
from urllib.parse import quote
from openai import OpenAI
from pydantic import ValidationError
from app.core.config import settings
from app.core.models import (
    ConversationMessage,
    IndigoEditRequest,
    IndigoGenerateRequest,
    IndigoAtlasImageReference,
    IndigoResearchBrief,
    IndigoResearchEditRequest,
    IndigoResearchRequest,
    IndigoStoryUnit,
)
from app.services.reference_images import fetch_public_reference_images

BEAT_SPACES = [
    ("01", "大堂", "ARRIVAL\nTHE GATE"),
    ("02", "前往客房（过道）", "CORRIDOR\nTHE LANE"),
    ("03", "客房", "GUEST ROOM\nTHE LANE HOUSE"),
    ("04", "全日餐厅 / 私人餐饮包间", "ALL DAY\nDINING / PDR"),
    ("05", "会议室", "WHERE HISTORY\nCONVENES"),
    ("06", "公区（康体区）", "MORNING IN\nTHE LANE"),
]

SYSTEM_PROMPT = """你是 Hotel Indigo 的品牌故事总监，专门为每家酒店撰写「在地故事线」。
你的输出将直接驱动一套 22 页 PPT 模板，必须严格返回 JSON，不能有任何额外文字。

────────────────────────────────────────────
文案风格要求
────────────────────────────────────────────
• 参考汪曾祺、沈从文的街区叙事：节制、具体、有人味，不是旅游宣传
• 禁止泛词：百年/古老/斑驳/沧桑/韵味/风情/烟火气/慢生活/文化之都/地标/名片
• 禁止旅游手册句式："在这里你能感受…"/"探索…"/"体验…"
• 地名、人名、工艺要具体（"大沽路 18 弄"而不是"弄堂深处"）

────────────────────────────────────────────
JSON Schema（每个字段的字数/格式严格遵守）
────────────────────────────────────────────
{
  "city": "string",
  "district": "string",
  "hotel_en": "string",
  "taglines": [                         // 必须 3 个，三选一供客户选
    {"zh": "≤4字，诗意有地方感", "sub": "8-16字，解释主标题内涵"},
    {"zh": "...", "sub": "..."},
    {"zh": "...", "sub": "..."}
  ],
  "concept_poem": [                     // 2段，每段3-4句，为品牌概念页
    "第一段：街区的历史/空间/精神内核，诗意散文",
    "第二段：这种精神与旅人/当下的连接"
  ],
  "origins": [                          // 必须 3 篇，角度分别是：
    {                                   //   01: 邻间日常生活风貌
      "title": "原话题标题（8字内）",
      "headline": "首句，强有力（≤30字），可直接作为 headline 显示",
      "body": "正文约120字，画面感，有具体细节"
    },
    { ... },                            //   02: 历史文化层
    { ... }                             //   03: 核心建筑或物理符号
  ],
  "emotion_headline": "「X」...的开启，「X」里...的...（用「」强调关键字，≤20字）",
  "emotion_poem": [                     // 2段，每段3-4句，给故事情绪页
    "第一段：街区感官体验（声音/光/气味/人）",
    "第二段：与旅人当下的连接，有留白"
  ],
  "story_summary": "≤60字，总结选定故事线的核心精神与空间体验，不用旅游句式",
  "beats": [                            // 必须 6 个，顺序和空间固定（见下）
    {
      "num": "01",
      "name_zh": "X·X·X·X（4字用·分隔，2字如「里·生」也可）",
      "space_zh": "（系统会填入）",
      "ghost_en": "（系统会填入）",
      "narrative": "约60字，把街区故事连接到这个酒店空间，有在地感",
      "tagline": "≤15字，这个空间的一句话 slogan",
      "mb_ghost_en": "2-3个英文词，\\n分隔，全大写，作为Moodboard左列大字",
      "mb_concept": "6-8字，Moodboard概念标题",
      "mb_concept_sub": "12-16字，副标题",
      "mb_col2_title": "10-15字，设计灵感来源标题",
      "mb_col2_accent": "8-12字，角色定位说明",
      "mb_col2_body": "约80字，从哪个在地元素提取、如何转化为空间设计语言",
      "mb_col3_title": "10-15字，空间设计语言标题",
      "mb_col3_accent": "8-12字，对应的设计决策角色",
      "mb_col3_body": "约80字，具体材质/比例/光线/家具等设计决策描述"
    },
    // num 02-06 同样结构
  ]
}

Beat 顺序和空间（name_zh 自由生成，space_zh/ghost_en 由系统覆盖，你可以留空）：
01 → 大堂（抵达）
02 → 走廊/过道
03 → 客房
04 → 餐厅/PDR
05 → 会议室
06 → 康体区

只返回 JSON，不要任何解释或 markdown 代码块。"""

RESEARCH_PROMPT = """你是 Hotel Indigo 的 Stage 1 Neighborhood Researcher。
你的任务不是写最终故事，而是产出一份可被客户、业主、设计团队讨论的调研稿。
必须严格返回 JSON，不能有任何额外文字。

────────────────────────────────────────────
研究原则
────────────────────────────────────────────
• 先拆出区域关系、在地文化、故事信号，而不是直接写品牌文案。
• 调研必须跨媒介：书籍/地方志、学术论文、历史地图、规划文件、照片/明信片/影像、报纸档案、口述史/访谈、博物馆或非遗记录、实地观察、当代生活方式信号。
• 调研必须深入图书馆与档案库：公共图书馆地方文献、大学图书馆、城市/国家档案馆、博物馆资料库、地图馆藏、报纸数据库、政府开放资料都应被纳入检索计划。
• 先写清楚 media_plan、library_targets、source_library、research_actions：它们是下一轮讨论、补来源、再调研的工作台，不是装饰信息。
• source_library 是来源台账：可以包含已明确的来源，也可以包含待检索的来源槽位；待检索槽位不得伪装成真实书名、URL 或档案号。
• research_actions 是用户下一步可以点击或输入的研究动作，要具体到媒介、来源或 finding，例如“补查老地图支撑胡同肌理”。
• atlas 是 Stage 1 的核心工作台：必须把研究拆成可探索的区域、地点、媒介图层和地点档案；PPT 只是后续导出，不是 Stage 1 的限制。
• atlas.place 可以是具体地点、街区节点、文化场景或待实地核验的点位；没有真实坐标时 latitude/longitude 必须为 null，coordinate_status 写 "needs_geocoding" 或 "interpretive"。
• atlas.image_references 是内部研究参考图槽位：优先填写 caption/alt/上下文；若没有明确 source_url，不要伪造出处，后端会优先补公开来源 reference image，再补 internal fallback。
• 每条 finding 必须说明为什么它能转译成酒店空间设计语言。
• 严禁编造来源、URL、书名、档案名或具体数据。
• 如果没有可核来源，把 source_status 写成 "needs_verification"，sources 允许为空。
• 如果用户提供了来源或明确事实，可写 source_status: "client_provided"，但 sources 必须写明 "客户提供资料"、使用说明和用户给出的来源线索。
• 只有当输入中包含明确可核来源时，才可写 source_status: "verified"。
• "在地文化"是客户合规关注项：没有 reference 的在地文化内容只能作为 needs_verification，不能伪装成 finding。
• sources 为空且 source_status 不是 needs_verification 属于错误。
• 这份研究稿会在下一步驱动 22 页故事线，所以 finding 要具体、可讨论、可设计转译。

────────────────────────────────────────────
JSON Schema
────────────────────────────────────────────
{
  "city": "string",
  "district": "string",
  "hotel_en": "string",
  "summary": "60-90字，概括这片区的研究假设，不写成广告语",
  "source_policy": "一句话说明当前来源状态和待核要求",
  "media_plan": [
    {
      "medium": "书籍/地方志 / 地图 / 影像照片 / 报纸档案 / 口述史 / 官方规划 / 学术论文 / 实地观察 / 当代生活方式",
      "purpose": "说明这个媒介能回答什么研究问题",
      "target_materials": ["要找的材料类型，不能编具体书名或档案号"],
      "status": "to_search | reviewing | source_backed | blocked"
    }
  ],
  "library_targets": [
    {
      "name": "图书馆、档案馆、博物馆资料库或数据库名称；不确定则写类别，如'城市公共图书馆地方文献部'",
      "kind": "public_library | university_library | city_archive | museum_collection | map_collection | newspaper_database | government_data | fieldwork",
      "search_focus": "要检索什么关键词、主题或时期",
      "access_path": "官网/目录/线下/需客户提供权限；不确定则留空",
      "status": "to_search | reviewing | source_backed | blocked",
      "notes": "检索注意事项或缺口"
    }
  ],
  "source_library": [
    {
      "title": "真实来源标题，或待查来源槽位，如'城市公共图书馆地方文献检索'",
      "source_type": "book | gazetteer | map | photo_archive | newspaper | oral_history | museum_record | planning_doc | government_data | fieldwork | client_material | web",
      "institution": "出版方、馆藏机构、数据库或客户方；不确定则留空",
      "access_path": "URL、目录路径、线下获取方式或需客户提供权限；不确定则留空",
      "locator": "页码、章节、索书号、档案号、地图图幅、时间码或访问日期；待查来源留空",
      "status": "to_search | reviewing | verified | client_provided | blocked",
      "relevance": "这条来源/来源槽位预计支撑什么研究问题",
      "linked_findings": ["关联 finding 标题；未关联则为空数组"],
      "notes": "合规风险、权限问题或下一步动作"
    }
  ],
  "research_actions": [
    {
      "label": "按钮文案，8-14字",
      "instruction": "完整研究指令，用户点击后可直接用于再调研",
      "intent": "search_source | verify_finding | add_client_source | downgrade_hypothesis | expand_medium",
      "priority": "high | medium | low"
    }
  ],
  "atlas": {
    "title": "Neighborhood Atlas 标题",
    "framing": "50-80字，说明这张地图如何组织区域、地点、媒介和文化问题",
    "coordinate_policy": "说明哪些坐标是真实、哪些只是待核/解释性点位；不得伪造坐标",
    "regions": [
      {
        "id": "稳定短 id，如 region-core",
        "name": "区域名称",
        "role": "core_neighborhood | heritage_band | daily_life_zone | creative_cluster | transit_edge | riverfront | market_street | other",
        "summary": "这个区域承担的历史/生活/文化角色",
        "boundary_status": "verified | interpretive | needs_mapping",
        "linked_places": ["关联 place id"],
        "source_status": "needs_verification | client_provided | verified",
        "sources": [],
        "open_questions": ["区域边界或历史脉络还需要补查的问题"]
      }
    ],
    "places": [
      {
        "id": "稳定短 id，如 place-market-street",
        "name": "地点、街区节点、文化场景或待核点位名称",
        "zone": "所属 region name 或研究分区",
        "place_type": "landmark | street | market | archive | museum | community | craft | food | nightlife | landscape | cultural_signal | hypothesis",
        "latitude": null,
        "longitude": null,
        "coordinate_status": "verified | approximate | needs_geocoding | interpretive",
        "summary": "30-60字地点档案摘要",
        "historical_note": "40-90字，历史脉络；没有来源时写成待核假设",
        "cultural_note": "40-90字，在地文化/生活方式/人群活动说明；没有来源时写成待核假设",
        "design_translation": "40-80字，转译为空间、材质、光线、陈列、图像或动线的方法",
        "source_status": "needs_verification | client_provided | verified",
        "linked_findings": ["关联 finding 标题"],
        "evidence_mediums": ["书籍/地方志", "历史地图", "照片档案", "报纸", "口述史", "实地观察"],
        "sources": [],
        "image_references": [
          {
            "title": "图片 reference 标题或待补图片槽位",
            "caption": "图片应说明什么文化/历史信息",
            "image_url": "",
            "source_title": "",
            "source_url": "",
            "rights_status": "reference_only | licensed | public_domain | needs_review",
            "alt_text": "图片替代文字",
            "status": "to_source | sourced | rights_review | blocked",
            "notes": "权限、用途或下一步"
          }
        ],
        "open_questions": ["地点还需要补查的问题"]
      }
    ],
    "layers": [
      {
        "key": "stable_layer_key",
        "label": "图层名称",
        "medium": "map | photo_archive | text_archive | oral_history | fieldwork | planning_doc | contemporary_signal",
        "description": "这个图层帮助用户看什么",
        "status": "to_source | reviewing | source_backed | blocked",
        "linked_places": ["关联 place id"]
      }
    ]
  },
  "questions": ["3-5个下一轮应追问/补充的调研问题"],
  "findings": [
    {
      "category": "区域关系 / 在地文化 / 故事信号",
      "title": "8-12字研究点标题",
      "claim": "50-80字，可讨论的研究判断，避免无来源硬事实",
      "design_relevance": "40-70字，说明可如何转为空间、材质、光线、陈列或图像线索",
      "evidence_mediums": ["支撑或待验证这条 finding 的媒介类型"],
      "open_questions": ["还需要补查的问题；没有则为空数组"],
      "source_status": "needs_verification | client_provided | verified",
      "sources": [
        {
          "title": "来源标题；没有明确来源则不要填",
          "publisher": "发布方；没有明确来源则不要填",
          "url": "URL；没有明确来源则不要填",
          "medium": "书籍/地图/影像/报纸/档案/口述史/官网/客户资料等",
          "collection": "馆藏、数据库、栏目或资料夹；没有明确来源则不要填",
          "locator": "页码、章节、索书号、档案号、时间码或访问日期；没有明确来源则不要填",
          "usage_note": "这条来源支撑了什么"
        }
      ]
    }
  ]
}

media_plan 必须 6-9 条，library_targets 必须 5-8 条，source_library 必须 5-10 条，research_actions 必须 4-6 条，atlas.regions 必须 2-4 个，atlas.places 必须 5-8 个，atlas.layers 必须 4-6 个，findings 必须 6-9 条，三类 category 都要覆盖。只返回 JSON。"""

EDIT_PROMPT = SYSTEM_PROMPT + """

────────────────────────────────────────────
编辑模式
────────────────────────────────────────────
你会收到一份已经生成的 IndigoStoryUnit JSON 和用户修改意见。
请返回修改后的完整 IndigoStoryUnit JSON。

规则：
• 保持同一个 schema，不要丢字段。
• 若用户没有明确要求换图，保留所有 image_url / mood_image_url / col2_image_url / col3_image_url。
• 保持 3 个 taglines、3 个 origins、6 个 beats。
• beats 仍然围绕酒店空间触点叙事，不要变成普通旅游路线。
• 用户若要求结构顺序调整，可以调整 beats 顺序，但每个 beat 的空间描述、叙事和图片应跟随该 beat。
• 只返回 JSON，不要解释。
"""

IMAGE_FIELDS = ("image_url", "mood_image_url", "col2_image_url", "col3_image_url")


def _client() -> OpenAI:
    if settings.llm_provider == "deepseek":
        return OpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
    return OpenAI(api_key=settings.openai_api_key)


def _model() -> str:
    return "deepseek-chat" if settings.llm_provider == "deepseek" else "gpt-4o"


def _apply_fixed_fields(data: dict) -> dict:
    """Overwrite space_zh and ghost_en with the fixed hotel function mapping."""
    beats = data.get("beats", [])
    for i, (num, space_zh, ghost_en) in enumerate(BEAT_SPACES):
        if i < len(beats):
            beats[i]["num"] = num
            beats[i]["space_zh"] = space_zh
            beats[i]["ghost_en"] = ghost_en
    return data


def _history_context(history: list[ConversationMessage] | None) -> str:
    if not history:
        return ""
    lines = []
    for msg in history[-12:]:
        role = "用户" if msg.role == "user" else "助手"
        lines.append(f"{role}: {msg.content}")
    return "\n".join(lines)


def _preserve_images(original: IndigoStoryUnit, updated: IndigoStoryUnit) -> IndigoStoryUnit:
    originals_by_num = {beat.num: beat for beat in original.beats}
    for i, beat in enumerate(updated.beats):
        fallback = originals_by_num.get(beat.num)
        if fallback is None and i < len(original.beats):
            fallback = original.beats[i]
        if fallback is None:
            continue
        for field in IMAGE_FIELDS:
            if not getattr(beat, field, None):
                setattr(beat, field, getattr(fallback, field, None))
    return updated


def _renumber_beats(story: IndigoStoryUnit) -> IndigoStoryUnit:
    for i, beat in enumerate(story.beats):
        beat.num = f"{i + 1:02d}"
    return story


def _load_indigo_json(
    raw: str,
    req_city: str,
    req_district: str,
    hotel_en: str,
    apply_fixed_fields: bool = True,
) -> IndigoStoryUnit:
    data = json.loads(raw)
    data["city"] = req_city
    data["district"] = req_district
    data["hotel_en"] = hotel_en
    if apply_fixed_fields:
        data = _apply_fixed_fields(data)
    return IndigoStoryUnit(**data)


def _stable_lock(value: str) -> int:
    h = 0
    for ch in value:
        h = ((h * 31) + ord(ch)) & 0xFFFFFFFF
    return h % 100000


def _internal_reference_image_url(city: str, district: str, place_name: str, place_type: str, index: int) -> str:
    type_keywords = {
        "landmark": "landmark,architecture",
        "street": "street,city",
        "market": "market,street",
        "archive": "archive,library",
        "museum": "museum,architecture",
        "community": "neighborhood,street",
        "craft": "craft,artisan",
        "food": "food,market",
        "nightlife": "night,street",
        "landscape": "urban,landscape",
        "cultural_signal": "culture,street",
        "hypothesis": "city,architecture",
    }
    keywords = ",".join([
        type_keywords.get(place_type, "city,architecture"),
        city,
        district,
        place_name,
        "urban",
    ])
    lock = _stable_lock(f"{city}-{district}-{place_name}-{index}")
    return f"https://loremflickr.com/640/480/{quote(keywords)}?lock={lock}"


def _hydrate_internal_reference_images(research: IndigoResearchBrief) -> IndigoResearchBrief:
    if not research.atlas:
        return research

    for place in research.atlas.places:
        existing_references = list(place.image_references)
        references: list[IndigoAtlasImageReference] = []
        seen: set[str] = set()

        def add_reference(reference: IndigoAtlasImageReference) -> None:
            key = reference.source_url or reference.image_url or f"{reference.title}-{reference.caption}"
            if key in seen:
                return
            seen.add(key)
            references.append(reference)

        for reference in existing_references:
            if reference.image_url and reference.source_url:
                add_reference(reference)

        for reference in fetch_public_reference_images(
            city=research.city,
            district=research.district,
            place=place,
            limit=4,
        ):
            add_reference(reference)

        for reference in existing_references:
            if not (reference.image_url and reference.source_url):
                add_reference(reference)

        fallback_index = 0
        while len(references) < 4:
            fallback_index += 1
            index = len(references)
            seen.add(f"fallback-{place.id}-{fallback_index}")
            references.append(
                IndigoAtlasImageReference(
                    title=f"{place.name} reference {index + 1}",
                    caption=f"{place.name} 的内部研究参考图，用于视觉方向讨论。",
                    rights_status="reference_only",
                    status="internal_reference",
                    notes="No public source image was found automatically; using internal visual fallback.",
                )
            )

        for i, reference in enumerate(references):
            if not reference.image_url:
                reference.image_url = _internal_reference_image_url(
                    research.city,
                    research.district,
                    place.name,
                    place.place_type,
                    i,
                )
            if not reference.caption:
                reference.caption = reference.title or f"{place.name} 的内部研究参考图"
            if not reference.rights_status:
                reference.rights_status = "reference_only"
            if not reference.status:
                reference.status = "internal_reference"
            if reference.status == "internal_reference" and not reference.notes:
                reference.notes = "Internal research reference, not a sourced publication asset."

        place.image_references = references[:4]

    return research


def _load_research_json(raw: str, req_city: str, req_district: str, hotel_en: str) -> IndigoResearchBrief:
    data = json.loads(raw)
    data["city"] = req_city
    data["district"] = req_district
    data["hotel_en"] = hotel_en
    return _hydrate_internal_reference_images(IndigoResearchBrief(**data))


def _is_source_backed_finding(finding) -> bool:
    return finding.source_status in {"verified", "client_provided"} and len(finding.sources) > 0


def _research_readiness_error(research: IndigoResearchBrief) -> str | None:
    return None


async def generate_indigo_research(req: IndigoResearchRequest) -> IndigoResearchBrief:
    client = _client()
    hotel_en = req.hotel_en or f"{req.city} {req.district}"
    user_msg = (
        f"为 Hotel Indigo {req.city} {req.district} 做 Stage 1 Neighborhood Research。\n"
        f"hotel_en: \"{hotel_en}\"\n"
        f"city: \"{req.city}\"\n"
        f"district: \"{req.district}\"\n"
        "注意：先列出跨媒介调研计划和图书馆/档案库检索目标。"
        "不要编造来源；没有明确可核来源的 finding 必须标 needs_verification。"
    )
    convo = [
        {"role": "system", "content": RESEARCH_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    last_err: Exception | None = None
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=convo,
            temperature=0.6,
        )
        raw = resp.choices[0].message.content or ""
        try:
            return _load_research_json(raw, req.city, req.district, hotel_en)
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            convo.append({"role": "assistant", "content": raw})
            convo.append({
                "role": "user",
                "content": (
                    f"返回的 research JSON 不符合 schema，错误：{e}\n"
                    "请修正并严格按 schema 重新返回完整 JSON。findings 必须覆盖区域关系、"
                    "在地文化、故事信号；media_plan/library_targets 必须体现跨媒介和馆藏检索；"
                    "没有明确来源时 source_status 必须是 needs_verification。"
                ),
            })

    assert last_err is not None
    raise last_err


async def edit_indigo_research(req: IndigoResearchEditRequest) -> IndigoResearchBrief:
    research = req.research_brief
    client = _client()
    history = _history_context(req.conversation_history)
    user_msg = (
        f"当前 Stage 1 Research JSON:\n{json.dumps(research.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        f"用户调研讨论/再调研要求:\n{req.instruction.strip()}\n\n"
        "请基于用户意见更新完整 research JSON。不要写最终故事。"
    )
    if history:
        user_msg += f"\n最近对话上下文:\n{history}\n"

    convo = [
        {"role": "system", "content": RESEARCH_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    last_err: Exception | None = None
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=convo,
            temperature=0.5,
        )
        raw = resp.choices[0].message.content or ""
        try:
            return _load_research_json(raw, research.city, research.district, research.hotel_en)
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            convo.append({"role": "assistant", "content": raw})
            convo.append({
                "role": "user",
                "content": f"research JSON 不符合 schema，错误：{e}。请返回完整 JSON。",
            })

    assert last_err is not None
    raise last_err


async def generate_indigo(req: IndigoGenerateRequest) -> IndigoStoryUnit:
    client = _client()
    hotel_en = req.hotel_en or f"{req.city} {req.district}"
    user_msg = (
        f"为 Hotel Indigo {req.city} {req.district} 生成完整故事线。\n"
        f"hotel_en: \"{hotel_en}\"\n"
        f"city: \"{req.city}\"\n"
        f"district: \"{req.district}\""
    )
    if req.research_brief:
        readiness_error = _research_readiness_error(req.research_brief)
        if readiness_error:
            raise ValueError(readiness_error)
        user_msg += (
            "\n\n以下是已经在 Stage 1 讨论过的 Neighborhood Research。"
            "请把它作为唯一研究基础来写 Stage 2 故事线，不要新增未在 research 中出现的硬事实。"
            "这是内部研究模式：source_status 为 needs_verification 的内容可以作为方向性 hypothesis 使用，"
            "但写法要避免装成已证实事实，可用“片区线索指向”“可转译为”“作为设计假设”等表达。\n"
            f"{json.dumps(req.research_brief.model_dump(mode='json'), ensure_ascii=False)}"
        )

    convo = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    last_err: Exception | None = None
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=convo,
            temperature=0.85,
        )
        raw = resp.choices[0].message.content or ""
        try:
            return _load_indigo_json(raw, req.city, req.district, hotel_en)
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            convo.append({"role": "assistant", "content": raw})
            convo.append({
                "role": "user",
                "content": (
                    f"返回的 JSON 不符合 schema，错误：{e}\n"
                    "请修正并严格按 schema 重新返回完整 JSON。"
                    "taglines 必须 3 个，origins 必须 3 个，beats 必须 6 个，"
                    "每个 beat 的所有字段（包括 mb_* 字段）都必须填写。只返回 JSON。"
                ),
            })
            if attempt == 0:
                continue

    assert last_err is not None
    raise last_err


async def edit_indigo(req: IndigoEditRequest) -> IndigoStoryUnit:
    story = req.story_unit
    client = _client()
    current = story.model_dump(mode="json")
    history = _history_context(req.conversation_history)
    user_msg = (
        f"当前 IndigoStoryUnit JSON:\n{json.dumps(current, ensure_ascii=False)}\n\n"
        f"用户修改意见:\n{req.instruction.strip()}\n"
    )
    if history:
        user_msg += f"\n最近对话上下文:\n{history}\n"

    convo = [
        {"role": "system", "content": EDIT_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    last_err: Exception | None = None
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=_model(),
            response_format={"type": "json_object"},
            messages=convo,
            temperature=0.55,
        )
        raw = resp.choices[0].message.content or ""
        try:
            updated = _load_indigo_json(
                raw,
                story.city,
                story.district,
                story.hotel_en,
                apply_fixed_fields=False,
            )
            return _renumber_beats(_preserve_images(story, updated))
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            convo.append({"role": "assistant", "content": raw})
            convo.append({
                "role": "user",
                "content": (
                    f"修改后的 JSON 不符合 schema，错误：{e}\n"
                    "请修正并返回完整 JSON。保留原图 URL，taglines=3，origins=3，beats=6。"
                ),
            })
            if attempt == 0:
                continue

    assert last_err is not None
    raise last_err
