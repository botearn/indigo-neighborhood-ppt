import json
import anthropic
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


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def generate_story_unit(req: GenerateRequest) -> StoryUnit:
    client = _client()
    hotel_ctx = f" near {req.hotel_name}" if req.hotel_name else ""
    user_msg = f"Generate a neighborhood story unit for: {req.neighborhood}, {req.city}{hotel_ctx}."

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = response.content[0].text
    data = json.loads(raw)
    data["city"] = req.city
    data["neighborhood"] = req.neighborhood
    return StoryUnit(**data)


async def edit_story_unit(req: EditRequest) -> StoryUnit:
    client = _client()
    user_msg = f"""Current story unit:
{req.story_unit.model_dump_json(indent=2)}

Instruction: {req.instruction}

Apply the instruction and return the full updated story unit as JSON."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = response.content[0].text
    data = json.loads(raw)
    return StoryUnit(**data)
