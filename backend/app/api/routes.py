from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
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
    IndigoImageJobRequest,
    IndigoImageJobResponse,
    IndigoSingleImageRequest,
    IndigoStoryUnit,
)
from app.services import (
    generator,
    image_assets,
    image_generator,
    image_job_runner,
    image_jobs,
    indigo_generator,
    indigo_pptx_builder,
    locator,
    ppt_builder,
)


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
        history = auth.create_history(
            user_id=user.id,
            mode="fast",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )
        story.history_id = history["id"]
        auth.update_history_story(user.id, history["id"], story)
        return story
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=image_generator.image_error_message(e))


@router.post("/indigo/generate-text", response_model=IndigoStoryUnit)
async def indigo_generate_text(req: IndigoGenerateRequest, user: AuthUser = Depends(require_user)):
    try:
        story = await indigo_generator.generate_indigo(req)
        history = auth.create_history(
            user_id=user.id,
            mode="guided",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )
        story.history_id = history["id"]
        auth.update_history_story(user.id, history["id"], story)
        return story
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/indigo/generate-fast-text", response_model=IndigoStoryUnit)
async def indigo_generate_fast_text(req: IndigoGenerateRequest, user: AuthUser = Depends(require_user)):
    try:
        story = await indigo_generator.generate_indigo(req)
        history = auth.create_history(
            user_id=user.id,
            mode="fast",
            city=story.city,
            district=story.district,
            title=f"{story.city} {story.district}",
            story=story,
        )
        story.history_id = history["id"]
        auth.update_history_story(user.id, history["id"], story)
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
        raise HTTPException(status_code=500, detail=image_generator.image_error_message(e))


async def _owned_image_job(job_id: str, user: AuthUser):
    try:
        store = image_jobs.get_image_job_store()
        owner_id = await run_in_threadpool(store.owner_id, job_id)
        if owner_id != user.id:
            raise image_jobs.ImageJobNotFound(job_id)
        return store
    except image_jobs.ImageJobNotFound:
        raise HTTPException(status_code=404, detail="Image job not found")
    except image_jobs.ImageJobUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))


async def _image_job_response(store, job_id: str, user: AuthUser):
    job = await run_in_threadpool(store.get, job_id)
    if (
        job.status in {"completed", "partial"}
        and await run_in_threadpool(store.history_needs_sync, job_id)
    ):
        history_id = await run_in_threadpool(store.history_id, job_id)
        if history_id:
            updated = await run_in_threadpool(
                auth.update_history_story,
                user.id,
                history_id,
                job.story,
            )
            if updated:
                await run_in_threadpool(store.mark_history_synced, job_id)
    return job


@router.post(
    "/indigo/image-jobs",
    response_model=IndigoImageJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def indigo_image_job_create(
    req: IndigoImageJobRequest,
    user: AuthUser = Depends(require_user),
):
    try:
        history_id = req.history_id or req.story_unit.history_id
        if history_id:
            auth.get_history(user.id, history_id)
        store = image_jobs.get_image_job_store()
        job = await run_in_threadpool(
            store.create,
            user_id=user.id,
            story=req.story_unit,
            history_id=history_id,
        )
        targets = await run_in_threadpool(store.pending_targets, job.id)
        await run_in_threadpool(image_job_runner.enqueue_image_job, job.id, targets)
        if history_id:
            await run_in_threadpool(
                auth.update_history_story,
                user.id,
                history_id,
                job.story,
            )
        return await _image_job_response(store, job.id, user)
    except HTTPException:
        raise
    except image_jobs.ImageJobUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        if "job" in locals():
            await run_in_threadpool(store.mark_dispatch_failed, job.id, str(e))
        raise HTTPException(status_code=503, detail="Image job could not be queued")


@router.get("/indigo/image-jobs/{job_id}", response_model=IndigoImageJobResponse)
async def indigo_image_job_status(job_id: str, user: AuthUser = Depends(require_user)):
    store = await _owned_image_job(job_id, user)
    return await _image_job_response(store, job_id, user)


@router.post(
    "/indigo/image-jobs/{job_id}/retry",
    response_model=IndigoImageJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def indigo_image_job_retry(job_id: str, user: AuthUser = Depends(require_user)):
    store = await _owned_image_job(job_id, user)
    targets = await run_in_threadpool(store.prepare_retry, job_id)
    if targets:
        try:
            await run_in_threadpool(image_job_runner.enqueue_image_job, job_id, targets)
        except Exception as e:
            await run_in_threadpool(store.mark_dispatch_failed, job_id, str(e))
            raise HTTPException(status_code=503, detail="Image retry could not be queued")
    return await _image_job_response(store, job_id, user)


@router.delete("/indigo/image-jobs/{job_id}", response_model=IndigoImageJobResponse)
async def indigo_image_job_cancel(job_id: str, user: AuthUser = Depends(require_user)):
    store = await _owned_image_job(job_id, user)
    await run_in_threadpool(image_job_runner.revoke_image_job, job_id)
    return await _image_job_response(store, job_id, user)


@router.get("/indigo/image-assets/{asset_name}")
async def indigo_image_asset(asset_name: str):
    try:
        path = await run_in_threadpool(image_assets.resolve_image_asset, asset_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.post("/indigo/images/single", response_model=SingleImageResponse)
async def indigo_images_single(req: IndigoSingleImageRequest, user: AuthUser = Depends(require_user)):
    try:
        url = await image_generator.generate_indigo_single_image(req)
        return SingleImageResponse(image_url=url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=image_generator.image_error_message(e))


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
