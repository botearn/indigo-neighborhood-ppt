import json
from openai import OpenAI
from pydantic import ValidationError
from app.core.config import settings
from app.core.models import StoryUnit, GenerateRequest, EditRequest

SYSTEM_PROMPT = """你是 Hotel Indigo 的在地叙事作者。语调参考汪曾祺、沈从文写街区的方式——节制、具体、有人味，不是旅游宣传。

每个 beat 必须有两层文案：
- copy（≤30字）：感官钩子，最直接的一击。一个动作、一种气味、一声响动。
- detail（60-120字）：肌理层。必须具名——哪条街、哪家铺子、店主姓什么、做了多少年、什么手艺、什么时辰开锅。像在街区住了十年的人随口讲出来的细节。

硬性禁令（出现一次整个 beat 重写）：
- 禁止泛词：百年/古老/斑驳/沧桑/韵味/风情/文化/之都/名片/地标/代表/烟火气/慢生活
- 禁止陈词：石板路、青砖墙、斜阳光影、岁月痕迹、时光流转、市井温度
- 禁止旅游手册式总结句："这里是..."、"在这里你能..."、"感受..."、"体验..."

强制具体：
- 街/巷/路必须有真实名字（"大纱帽胡同口"而不是"巷口"）
- 店铺要有姓氏或字号（"王记炸酱"而不是"小店"）
- 时间要精确（"下午三点出锅"而不是"午后"）
- 工艺/动作要有专有词（"黄豆发酵九十天"、"刀剁不用机器搅"）

其他规则：
- signature.zh: ≤8字，禁用上述泛词
- signature.en: ≤6词
- hook_line: ≤15字，把客人从酒店拽到街上
- anchor: "酒店步行X分钟，XX路口向X"格式
- beats: 必须 6 个，DO / SEE / HEAR / TASTE / DRINK / BUY 每个 verb 各 1 个 beat（顺序可调，但缺一不可、不可重复）
- 每个 beat 至少3条 sensory，type 限定 sound/smell/light/texture
- action_cue: 具体动作，禁止 打卡/探索/发现/体验/感受

只返回严格匹配此 schema 的 JSON：
{
  "city": "string",
  "neighborhood": "string",
  "signature": {"zh": "string", "en": "string"},
  "anchor": "string",
  "hook_line": "string",
  "beats": [
    {
      "title": "string",
      "copy": "string",
      "detail": "string",
      "verb": "DO|SEE|HEAR|TASTE|DRINK|BUY",
      "sensory": [{"type": "sound|smell|light|texture", "description": "string"}]
    }
  ],
  "action_cue": "string"
}"""


def _client() -> OpenAI:
    if settings.llm_provider == "deepseek":
        return OpenAI(api_key=settings.deepseek_api_key, base_url="https://api.deepseek.com")
    return OpenAI(api_key=settings.openai_api_key)


def _models() -> tuple[str, str]:
    if settings.llm_provider == "deepseek":
        return "deepseek-chat", "deepseek-chat"
    return "gpt-4o-mini", "gpt-4o"


def _build_story(raw: str, overrides: dict | None = None) -> StoryUnit:
    data = json.loads(raw)
    if overrides:
        data.update(overrides)
    return StoryUnit(**data)


def _complete_with_retry(
    client: OpenAI,
    model: str,
    messages: list[dict],
    overrides: dict | None = None,
) -> StoryUnit:
    convo = list(messages)
    last_err: Exception | None = None
    for _ in range(2):
        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=convo,
        )
        raw = response.choices[0].message.content or ""
        try:
            return _build_story(raw, overrides)
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            convo.append({"role": "assistant", "content": raw})
            convo.append({
                "role": "user",
                "content": (
                    "上一次返回的 JSON 不符合 schema，错误如下：\n"
                    f"{e}\n\n"
                    "请严格按 schema 返回完整 JSON，不要省略任何必需字段："
                    "beats 必须正好 6 个，DO/SEE/HEAR/TASTE/DRINK/BUY 每个 verb 各 1 个，缺一不可、不可重复；"
                    "顶层 action_cue 必填；每个 beat 必须包含 title/copy/verb/sensory，"
                    "sensory 至少 3 条且 type 限定 sound/smell/light/texture。"
                    "只返回 JSON，不要任何解释。"
                ),
            })
    assert last_err is not None
    raise last_err


async def generate_story_unit(req: GenerateRequest) -> StoryUnit:
    client = _client()
    gen_model, _ = _models()
    hotel_ctx = f" near {req.hotel_name}" if req.hotel_name else ""
    user_msg = f"Generate a neighborhood story unit for: {req.neighborhood}, {req.city}{hotel_ctx}."

    return _complete_with_retry(
        client,
        gen_model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        overrides={"city": req.city, "neighborhood": req.neighborhood},
    )


async def edit_story_unit(req: EditRequest) -> StoryUnit:
    client = _client()
    _, edit_model = _models()
    user_msg = f"""Current story unit:
{req.story_unit.model_dump_json(indent=2)}

Instruction: {req.instruction}

Apply the instruction and return the full updated story unit as JSON."""

    return _complete_with_retry(
        client,
        edit_model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
