"""
Hotel Indigo 22-slide storyline generator.
One large LLM call → complete IndigoStoryUnit JSON.
"""
import json
from openai import OpenAI
from pydantic import ValidationError
from app.core.config import settings
from app.core.models import IndigoStoryUnit, IndigoGenerateRequest

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


async def generate_indigo(req: IndigoGenerateRequest) -> IndigoStoryUnit:
    client = _client()
    hotel_en = req.hotel_en or f"{req.city} {req.district}"
    user_msg = (
        f"为 Hotel Indigo {req.city} {req.district} 生成完整故事线。\n"
        f"hotel_en: \"{hotel_en}\"\n"
        f"city: \"{req.city}\"\n"
        f"district: \"{req.district}\""
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
            data = json.loads(raw)
            data["city"] = req.city
            data["district"] = req.district
            data["hotel_en"] = hotel_en
            data = _apply_fixed_fields(data)
            return IndigoStoryUnit(**data)
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
