import os
import fal_client
from app.core.config import settings
from app.core.models import StoryUnit


def _set_key():
    os.environ["FAL_KEY"] = settings.fal_key


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


async def generate_images(story: StoryUnit) -> StoryUnit:
    _set_key()

    async def gen(prompt: str) -> str:
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

    story.mood_image_url = await gen(_mood_prompt(story))
    for i, beat in enumerate(story.beats):
        beat.image_url = await gen(_beat_prompt(story, i))

    return story
