import json
from openai import OpenAI
from app.core.config import settings
from app.core.models import StoryUnit, GenerateRequest, EditRequest

SYSTEM_PROMPT = """You are a Hotel Indigo neighborhood storytelling expert.
Your job is to generate authentic, sensory-driven neighborhood narratives — not travel brochures.

Rules:
- Signature zh: ≤8 Chinese characters. Forbidden: 文化/风情/韵味/之都/名片/地标/代表
- Signature en: ≤6 words
- hook_line: ≤15 Chinese characters, pulls guests from hotel into the street
- Each beat: title + copy (≤30 chars) + one of [DO/SEE/HEAR/TASTE/DRINK/BUY] + ≥3 sensory details
- beats: 3-5 total, covering ≥3 different verbs
- action_cue: concrete action. Forbidden: 打卡/探索/发现/体验/感受
- anchor: distance and direction from hotel (e.g. "酒店步行8分钟，玉林路口向南")
- Write from inside the neighborhood, not outside looking in
- Be specific: name streets, sounds, smells, times of day

Return ONLY valid JSON matching this schema exactly:
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


async def generate_story_unit(req: GenerateRequest) -> StoryUnit:
    client = _client()
    gen_model, _ = _models()
    hotel_ctx = f" near {req.hotel_name}" if req.hotel_name else ""
    user_msg = f"Generate a neighborhood story unit for: {req.neighborhood}, {req.city}{hotel_ctx}."

    response = client.chat.completions.create(
        model=gen_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )

    data = json.loads(response.choices[0].message.content)
    data["city"] = req.city
    data["neighborhood"] = req.neighborhood
    return StoryUnit(**data)


async def edit_story_unit(req: EditRequest) -> StoryUnit:
    client = _client()
    _, edit_model = _models()
    user_msg = f"""Current story unit:
{req.story_unit.model_dump_json(indent=2)}

Instruction: {req.instruction}

Apply the instruction and return the full updated story unit as JSON."""

    response = client.chat.completions.create(
        model=edit_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )

    data = json.loads(response.choices[0].message.content)
    return StoryUnit(**data)
