from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool
from app.core import auth
from app.core.auth import AuthUser, require_user
from app.core.models import (
    GenerateRequest,
    EditRequest,
    StoryUnit,
    SingleImageRequest,
    SingleImageResponse,
    LocateRequest,
    LocateResponse,
    IndigoGenerateRequest,
    IndigoEditRequest,
    IndigoSingleImageRequest,
    IndigoStoryUnit,
)
from app.services import generator, ppt_builder, image_generator, locator, indigo_generator, indigo_pptx_builder


class ExportRequest(BaseModel):
    neighborhood: str
    city: str
    slides: list[str]

router = APIRouter(prefix="/api")


@router.post("/indigo/generate", response_model=IndigoStoryUnit)
async def indigo_generate(req: IndigoGenerateRequest, user: AuthUser = Depends(require_user)):
    try:
        story = await indigo_generator.generate_indigo(req)
        story = await image_generator.generate_indigo_images(story)
        auth.create_history(
            user_id=user.id,
            mode="fast",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )
        return story
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/generate-text", response_model=IndigoStoryUnit)
async def indigo_generate_text(req: IndigoGenerateRequest, user: AuthUser = Depends(require_user)):
    try:
        story = await indigo_generator.generate_indigo(req)
        auth.create_history(
            user_id=user.id,
            mode="guided",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )
        return story
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/edit", response_model=IndigoStoryUnit)
async def indigo_edit(req: IndigoEditRequest, user: AuthUser = Depends(require_user)):
    try:
        return await indigo_generator.edit_indigo(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/images", response_model=IndigoStoryUnit)
async def indigo_images(story: IndigoStoryUnit, user: AuthUser = Depends(require_user)):
    try:
        return await image_generator.generate_indigo_images(story)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/images/single", response_model=SingleImageResponse)
async def indigo_images_single(req: IndigoSingleImageRequest, user: AuthUser = Depends(require_user)):
    try:
        url = await image_generator.generate_indigo_single_image(req)
        return SingleImageResponse(image_url=url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/export-pptx")
async def indigo_export_pptx(story: IndigoStoryUnit, user: AuthUser = Depends(require_user)):
    try:
        data = await run_in_threadpool(indigo_pptx_builder.build_indigo_pptx, story)
        filename = f"{story.district}_{story.city}.pptx"
        encoded = quote(filename)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f"attachment; filename=\"presentation.pptx\"; filename*=UTF-8''{encoded}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/locate", response_model=LocateResponse)
async def locate(req: LocateRequest, user: AuthUser = Depends(require_user)):
    try:
        return await locator.locate(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=StoryUnit)
async def generate(req: GenerateRequest, user: AuthUser = Depends(require_user)):
    try:
        story = await generator.generate_story_unit(req)
        auth.create_history(
            user_id=user.id,
            mode="guided",
            city=story.city,
            district=story.neighborhood,
            title=f"{story.city} {story.neighborhood}",
            story=story,
        )
        return story
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit", response_model=StoryUnit)
async def edit(req: EditRequest, user: AuthUser = Depends(require_user)):
    try:
        return await generator.edit_story_unit(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/images", response_model=StoryUnit)
async def images(story: StoryUnit, user: AuthUser = Depends(require_user)):
    try:
        return await image_generator.generate_images(story)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/images/single", response_model=SingleImageResponse)
async def images_single(req: SingleImageRequest, user: AuthUser = Depends(require_user)):
    try:
        url = await image_generator.generate_single_image(req)
        return SingleImageResponse(image_url=url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
async def export(request: Request, user: AuthUser = Depends(require_user)):
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


@router.get("/history")
async def history_list(user: AuthUser = Depends(require_user)):
    return {"items": auth.list_history(user.id)}


@router.get("/history/{item_id}")
async def history_detail(item_id: str, user: AuthUser = Depends(require_user)):
    return auth.get_history(user.id, item_id)
