from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from app.core.models import GenerateRequest, EditRequest, StoryUnit
from app.services import generator, ppt_builder, image_generator


class ExportRequest(BaseModel):
    neighborhood: str
    city: str
    slides: list[str]

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
async def export(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")

    try:
        if isinstance(body, dict) and isinstance(body.get("slides"), list):
            req = ExportRequest(**body)
            data = ppt_builder.build_ppt_from_slides(req.slides)
            filename = f"{req.neighborhood}_{req.city}.pptx"
        else:
            story = StoryUnit(**body)
            data = ppt_builder.build_ppt_from_story(story)
            filename = f"{story.neighborhood}_{story.city}.pptx"
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    encoded = quote(filename)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename=\"presentation.pptx\"; filename*=UTF-8''{encoded}"},
    )
