import asyncio
import random

import httpx
from celery import Celery, group

from app.core.config import settings
from app.core.models import IndigoSingleImageRequest
from app.services import image_generator, image_jobs


broker_url = settings.redis_url or "memory://"
result_backend = settings.redis_url or "cache+memory://"

celery_app = Celery("indigo", broker=broker_url, backend=result_backend)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    result_expires=settings.image_job_ttl_seconds,
    broker_connection_retry_on_startup=True,
)


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {408, 409, 425, 429} or exc.response.status_code >= 500
    return not isinstance(exc, ValueError)


@celery_app.task(
    bind=True,
    name="indigo.generate_image",
    queue="image_batch",
    max_retries=settings.image_job_max_retries,
)
def generate_image_task(self, job_id: str, key: str) -> dict[str, str]:
    store = image_jobs.get_image_job_store()
    if store.is_cancel_requested(job_id):
        return {"target": key, "status": "cancelled"}

    current = store.get(job_id)
    if key not in store.pending_targets(job_id):
        return {"target": key, "status": "completed"}

    beat_index, image_field = image_jobs.parse_target_key(key)
    store.mark_running(job_id)
    request = IndigoSingleImageRequest(
        story_unit=current.story,
        beat_index=beat_index,
        image_field=image_field,
    )

    try:
        image_url = asyncio.run(
            image_generator.generate_indigo_single_image(
                request,
                idempotency_key=f"{job_id}:{key}",
            )
        )
        if not image_url:
            raise RuntimeError("Image provider returned an empty image")
    except Exception as exc:
        if _retryable(exc) and self.request.retries < settings.image_job_max_retries:
            countdown = min(2 ** self.request.retries, 30) + random.uniform(0, 1)
            raise self.retry(exc=exc, countdown=countdown)
        store.record_failure(job_id, key, image_generator.image_error_message(exc))
        return {"target": key, "status": "failed"}

    if store.is_cancel_requested(job_id):
        return {"target": key, "status": "cancelled"}
    store.record_success(job_id, key, image_url)
    return {"target": key, "status": "completed"}


def enqueue_image_job(job_id: str, targets: list[str]) -> list[str]:
    if not targets:
        image_jobs.get_image_job_store().finalize_if_done(job_id)
        return []

    batch = group(generate_image_task.s(job_id, key) for key in targets)
    result = batch.apply_async()
    task_ids = [child.id for child in result.results]
    image_jobs.get_image_job_store().set_task_ids(job_id, task_ids)
    return task_ids


def revoke_image_job(job_id: str) -> None:
    store = image_jobs.get_image_job_store()
    store.request_cancel(job_id)
    for task_id in store.task_ids(job_id):
        celery_app.control.revoke(task_id, terminate=False)
