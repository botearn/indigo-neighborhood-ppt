import asyncio
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.core.config import settings
from app.core.models import IndigoSingleImageRequest
from app.services import image_assets, image_generator, image_jobs


_executor = ThreadPoolExecutor(
    max_workers=max(settings.image_job_concurrency, 1),
    thread_name_prefix="indigo-image",
)
_scheduled: set[tuple[str, str]] = set()
_scheduled_lock = threading.Lock()


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {408, 409, 425, 429} or exc.response.status_code >= 500
    return not isinstance(exc, ValueError)


def _run_target(job_id: str, key: str) -> None:
    store = image_jobs.get_image_job_store()
    try:
        if store.is_cancel_requested(job_id) or key not in store.pending_targets(job_id):
            return

        beat_index, image_field = image_jobs.parse_target_key(key)
        store.mark_running(job_id)
        request = IndigoSingleImageRequest(
            story_unit=store.story(job_id),
            beat_index=beat_index,
            image_field=image_field,
        )

        image_url = ""
        last_error: Exception | None = None
        for attempt in range(settings.image_job_max_retries + 1):
            try:
                image_url = asyncio.run(
                    image_generator.generate_indigo_single_image(
                        request,
                        idempotency_key=f"{job_id}:{key}",
                    )
                )
                if not image_url:
                    raise RuntimeError("Image provider returned an empty image")
                break
            except Exception as exc:
                last_error = exc
                if not _retryable(exc) or attempt >= settings.image_job_max_retries:
                    break
                time.sleep(min(2 ** attempt, 30) + random.uniform(0, 1))

        if not image_url:
            assert last_error is not None
            store.record_failure(job_id, key, image_generator.image_error_message(last_error))
            return

        persisted_url = image_assets.persist_image(image_url)
        if not store.record_success(job_id, key, persisted_url):
            image_assets.delete_image(persisted_url)
    except image_jobs.ImageJobNotFound:
        return
    except Exception as exc:
        try:
            store.record_failure(job_id, key, image_generator.image_error_message(exc))
        except image_jobs.ImageJobNotFound:
            pass


def _run_and_release(job_id: str, key: str) -> None:
    try:
        _run_target(job_id, key)
    finally:
        with _scheduled_lock:
            _scheduled.discard((job_id, key))


def enqueue_image_job(job_id: str, targets: list[str]) -> list[str]:
    accepted: list[str] = []
    for key in targets:
        marker = (job_id, key)
        with _scheduled_lock:
            if marker in _scheduled:
                continue
            _scheduled.add(marker)
        accepted.append(key)
        _executor.submit(_run_and_release, job_id, key)

    if not accepted:
        image_jobs.get_image_job_store().finalize_if_done(job_id)
    return accepted


def revoke_image_job(job_id: str) -> None:
    image_jobs.get_image_job_store().request_cancel(job_id)


def resume_pending_jobs() -> None:
    store = image_jobs.get_image_job_store()
    for job_id in store.resumable_job_ids():
        enqueue_image_job(job_id, store.pending_targets(job_id))
