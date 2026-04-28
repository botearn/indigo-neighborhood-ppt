import os
import base64
import asyncio
import random
import httpx
import fal_client
from app.core.config import settings
from app.core.models import StoryUnit


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
    async with httpx.AsyncClient(timeout=30) as client:
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
        return pick["urls"]["regular"]


def _mood_query(story: StoryUnit) -> str:
    return f"{story.signature.en} {story.neighborhood} {story.city} editorial".strip()


def _beat_query(story: StoryUnit, beat_index: int) -> str:
    beat = story.beats[beat_index]
    kw = VERB_KEYWORDS.get(beat.verb, "")
    return f"{kw} {story.neighborhood} {story.city}".strip()


async def _gen(prompt: str) -> str:
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
