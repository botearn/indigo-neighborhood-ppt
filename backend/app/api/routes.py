from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from app.core.models import GenerateRequest, EditRequest, StoryUnit
from app.services import generator, ppt_builder, image_generator

router = APIRouter(prefix="/api")


@router.post("/generate", response_model=StoryUnit)
async def generate(req: GenerateRequest):
    try:
        return await generator.generate_story_unit(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit", response_model=StoryUnit)
async def edit(req: EditRequest):
    try:
        return await generator.edit_story_unit(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/images", response_model=StoryUnit)
async def images(story: StoryUnit):
    try:
        return await image_generator.generate_images(story)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
async def export(story: StoryUnit):
    try:
        data = ppt_builder.build_ppt(story)
        filename = f"{story.neighborhood}_{story.city}.pptx"
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
