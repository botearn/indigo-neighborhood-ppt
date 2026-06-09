import os
import base64
import asyncio
import random
import httpx
import fal_client
from app.core.config import settings
from app.core.models import StoryUnit, SingleImageRequest, IndigoStoryUnit


VERB_KEYWORDS = {
    "DO": "street life",
    "SEE": "architecture detail",
    "HEAR": "alley scene",
    "TASTE": "local food",
    "DRINK": "tea cafe",
    "BUY": "market shop",
}


def _mood_prompt(story: StoryUnit) -> str:
    return (
        f"{story.signature.en}, {story.neighborhood}, {story.city}, "
        "Hotel Indigo editorial photography, soft luminous natural light, "
        "muted teal and warm amber tones, deep navy shadows, ivory highlights, "
        "water reflection, elegant architectural detail, high-end hotel lifestyle, "
        "wide establishing shot, contemplative atmosphere, sophisticated, no people"
    )


def _beat_prompt(story: StoryUnit, beat_index: int) -> str:
    beat = story.beats[beat_index]
    sensory = ", ".join(d.description for d in beat.sensory[:3])
    return (
        f"{beat.title}, {sensory}, {story.neighborhood}, {story.city}, "
        "Hotel Indigo editorial photography, soft luminous light, "
        "muted teal and warm amber palette, elegant, intimate detail, "
        "sophisticated lifestyle, high-end travel photography, no text"
    )


async def _gen_fal(prompt: str) -> str:
    os.environ["FAL_KEY"] = settings.fal_key
    result = await fal_client.run_async(
        "fal-ai/flux/schnell",
        arguments={
            "prompt": prompt,
            "image_size": "landscape_16_9",
            "num_inference_steps": 4,
            "num_images": 1,
        },
    )
    return result["images"][0]["url"]


async def _gen_relay(prompt: str) -> str:
    if not settings.relay_api_key:
        raise RuntimeError("RELAY_API_KEY is not set")
    url = f"{settings.relay_base_url.rstrip('/')}/images/generations"
    headers = {
        "Authorization": f"Bearer {settings.relay_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.relay_image_model,
        "prompt": prompt,
        "n": 1,
        "size": "1792x1024",
    }
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    item = data["data"][0]
    if item.get("url"):
        return item["url"]
    if item.get("b64_json"):
        return f"data:image/png;base64,{item['b64_json']}"
    raise RuntimeError(f"relay returned no image: {data}")


async def _gen_gemini(prompt: str) -> str:
    from google import genai
    from google.genai import types

    def _call() -> str:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_image_model,
            contents=prompt,
            config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]),
        )
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None) is not None:
                b64 = base64.b64encode(part.inline_data.data).decode("ascii")
                mime = part.inline_data.mime_type or "image/png"
                return f"data:{mime};base64,{b64}"
        raise RuntimeError("Gemini returned no image")

    return await asyncio.to_thread(_call)


async def _search_unsplash(query: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(
            "https://api.unsplash.com/search/photos",
            headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
            params={
                "query": query,
                "per_page": 10,
                "orientation": "landscape",
                "content_filter": "high",
            },
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return ""
        pick = random.choice(results)
        img_url = pick["urls"]["regular"]
        img_resp = await client.get(img_url)
        img_resp.raise_for_status()
        b64 = base64.b64encode(img_resp.content).decode("ascii")
        mime = img_resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return f"data:{mime};base64,{b64}"


def _mood_query(story: StoryUnit) -> str:
    return f"{story.signature.en} {story.neighborhood} {story.city} editorial".strip()


def _beat_query(story: StoryUnit, beat_index: int) -> str:
    beat = story.beats[beat_index]
    kw = VERB_KEYWORDS.get(beat.verb, "")
    return f"{kw} {story.neighborhood} {story.city}".strip()


async def _gen(prompt: str) -> str:
    if settings.image_provider == "relay":
        return await _gen_relay(prompt)
    if settings.image_provider == "gemini":
        return await _gen_gemini(prompt)
    return await _gen_fal(prompt)


async def generate_images(story: StoryUnit) -> StoryUnit:
    if settings.image_provider == "unsplash":
        story.mood_image_url = await _search_unsplash(_mood_query(story)) or None
        for i, beat in enumerate(story.beats):
            beat.image_url = await _search_unsplash(_beat_query(story, i)) or None
        return story

    story.mood_image_url = await _gen(_mood_prompt(story))
    for i, beat in enumerate(story.beats):
        beat.image_url = await _gen(_beat_prompt(story, i))
    return story


async def generate_single_image(req: SingleImageRequest) -> str:
    story = req.story_unit
    if req.target_type == "mood":
        if settings.image_provider == "unsplash":
            return await _search_unsplash(_mood_query(story)) or ""
        prompt = _mood_prompt(story)
    elif req.target_type == "beat":
        if req.beat_index is None or not (0 <= req.beat_index < len(story.beats)):
            raise ValueError(f"invalid beat_index: {req.beat_index}")
        if settings.image_provider == "unsplash":
            return await _search_unsplash(_beat_query(story, req.beat_index)) or ""
        prompt = _beat_prompt(story, req.beat_index)
    else:
        raise ValueError(f"unknown target_type: {req.target_type}")

    if req.instruction:
        prompt = f"{prompt}, {req.instruction.strip()}"

    return await _gen(prompt)


# ── Indigo image generation ──────────────────────────────────────────────

def _indigo_beat_prompt(beat, city: str, district: str) -> str:
    return (
        f"{beat.narrative}, {beat.name_zh}, {city}, {district}, "
        "Hotel Indigo editorial photography, soft luminous natural light, "
        "muted teal and warm amber tones, deep navy shadows, ivory highlights, "
        "elegant architectural detail, high-end hotel lifestyle, "
        "sophisticated, intimate, no text, no people"
    )


def _indigo_mood_prompt(beat, city: str, district: str) -> str:
    return (
        f"{beat.mb_concept}, {beat.mb_col2_body[:60]}, {city}, {district}, "
        "Hotel Indigo moodboard material, texture and pattern detail, "
        "soft luminous natural light, muted teal and warm amber palette, "
        "architectural surface, material sample, fabric detail, "
        "sophisticated, abstract, no text, no people"
    )


def _indigo_col2_prompt(beat, city: str, district: str) -> str:
    return (
        f"{beat.mb_col2_title}, {beat.mb_col2_accent}, {city}, {district}, "
        "Hotel Indigo interior design detail, furniture and decor closeup, "
        "warm natural light, teal and amber accent, "
        "sophisticated hotel room vignette, no text, no people"
    )


def _indigo_col3_prompt(beat, city: str, district: str) -> str:
    return (
        f"{beat.mb_col3_title}, {beat.mb_col3_accent}, {city}, {district}, "
        "Hotel Indigo local craft and artisan detail, handmade texture, "
        "soft diffused light, earthy warm tones with teal accent, "
        "cultural artifact closeup, no text, no people"
    )


async def generate_indigo_images(story: IndigoStoryUnit) -> IndigoStoryUnit:
    city, district = story.city, story.district
    import asyncio
    for beat in story.beats:
        if settings.image_provider == "unsplash":
            beat.image_url = await _search_unsplash(
                f"{beat.name_zh} {city} {district} editorial"
            ) or None
            beat.mood_image_url = await _search_unsplash(
                f"{beat.mb_concept} {city} {district} texture"
            ) or None
            beat.col2_image_url = await _search_unsplash(
                f"{beat.mb_col2_title} {city} interior design"
            ) or None
            beat.col3_image_url = await _search_unsplash(
                f"{beat.mb_col3_title} {city} craft artisan"
            ) or None
        else:
            # 4 张图并发生成
            results = await asyncio.gather(
                _gen(_indigo_beat_prompt(beat, city, district)),
                _gen(_indigo_mood_prompt(beat, city, district)),
                _gen(_indigo_col2_prompt(beat, city, district)),
                _gen(_indigo_col3_prompt(beat, city, district)),
            )
            beat.image_url = results[0]
            beat.mood_image_url = results[1]
            beat.col2_image_url = results[2]
            beat.col3_image_url = results[3]
    return story
