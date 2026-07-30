import json
import secrets
import time
from typing import Any

from app.core.config import settings
from app.core.models import IndigoImageJobResponse, IndigoStoryUnit


IMAGE_FIELDS = ("image_url", "mood_image_url", "col2_image_url", "col3_image_url")
JOB_PREFIX = "indigo:image-job"


class ImageJobUnavailable(RuntimeError):
    pass


class ImageJobNotFound(KeyError):
    pass


def target_key(beat_index: int, image_field: str) -> str:
    if image_field not in IMAGE_FIELDS:
        raise ValueError(f"unknown image field: {image_field}")
    return f"{beat_index}:{image_field}"


def parse_target_key(key: str) -> tuple[int, str]:
    beat_raw, separator, image_field = key.partition(":")
    if not separator or image_field not in IMAGE_FIELDS:
        raise ValueError(f"invalid image target: {key}")
    return int(beat_raw), image_field


def all_target_keys(story: IndigoStoryUnit) -> list[str]:
    return [
        target_key(beat_index, image_field)
        for image_field in IMAGE_FIELDS
        for beat_index in range(len(story.beats))
    ]


class RedisImageJobStore:
    def __init__(self, client: Any | None = None):
        if client is None:
            if not settings.redis_url:
                raise ImageJobUnavailable("Image jobs are not configured")
            from redis import Redis

            client = Redis.from_url(settings.redis_url, decode_responses=True)
        self.client = client
        self.ttl = max(settings.image_job_ttl_seconds, 60)

    def _job_key(self, job_id: str) -> str:
        return f"{JOB_PREFIX}:{job_id}"

    def _results_key(self, job_id: str) -> str:
        return f"{self._job_key(job_id)}:results"

    def _errors_key(self, job_id: str) -> str:
        return f"{self._job_key(job_id)}:errors"

    def _touch(self, job_id: str) -> None:
        now = int(time.time())
        job_key = self._job_key(job_id)
        self.client.hset(job_key, mapping={"updated_at": now})
        self.client.expire(job_key, self.ttl)
        self.client.expire(self._results_key(job_id), self.ttl)
        self.client.expire(self._errors_key(job_id), self.ttl)

    def create(
        self,
        *,
        user_id: str,
        story: IndigoStoryUnit,
        history_id: str | None = None,
    ) -> IndigoImageJobResponse:
        job_id = secrets.token_urlsafe(16)
        now = int(time.time())
        story = story.model_copy(deep=True)
        story.image_job_id = job_id
        targets = all_target_keys(story)
        job_key = self._job_key(job_id)
        self.client.hset(
            job_key,
            mapping={
                "id": job_id,
                "user_id": user_id,
                "status": "queued",
                "total": len(targets),
                "story_json": story.model_dump_json(),
                "target_keys_json": json.dumps(targets),
                "history_id": history_id or "",
                "task_ids_json": "[]",
                "cancel_requested": "0",
                "history_synced": "0",
                "created_at": now,
                "updated_at": now,
            },
        )

        existing = {
            target_key(beat_index, image_field): value
            for beat_index, beat in enumerate(story.beats)
            for image_field in IMAGE_FIELDS
            if (value := getattr(beat, image_field, None))
        }
        if existing:
            self.client.hset(self._results_key(job_id), mapping=existing)
        self._touch(job_id)
        return self.get(job_id)

    def _raw_job(self, job_id: str) -> dict[str, str]:
        job = self.client.hgetall(self._job_key(job_id))
        if not job:
            raise ImageJobNotFound(job_id)
        return job

    def get(self, job_id: str) -> IndigoImageJobResponse:
        job = self._raw_job(job_id)
        results = self.client.hgetall(self._results_key(job_id))
        errors = self.client.hgetall(self._errors_key(job_id))
        story = IndigoStoryUnit.model_validate_json(job["story_json"])
        for key, image_url in results.items():
            beat_index, image_field = parse_target_key(key)
            setattr(story.beats[beat_index], image_field, image_url)

        return IndigoImageJobResponse(
            id=job_id,
            status=job["status"],
            total=int(job["total"]),
            completed=len(results),
            failed=len(errors),
            created_at=int(job["created_at"]),
            updated_at=int(job["updated_at"]),
            story=story,
            errors=errors,
        )

    def owner_id(self, job_id: str) -> str:
        return self._raw_job(job_id)["user_id"]

    def pending_targets(self, job_id: str) -> list[str]:
        job = self._raw_job(job_id)
        targets = json.loads(job["target_keys_json"])
        completed = self.client.hgetall(self._results_key(job_id))
        return [key for key in targets if key not in completed]

    def failed_targets(self, job_id: str) -> list[str]:
        self._raw_job(job_id)
        return list(self.client.hgetall(self._errors_key(job_id)))

    def story(self, job_id: str) -> IndigoStoryUnit:
        return IndigoStoryUnit.model_validate_json(self._raw_job(job_id)["story_json"])

    def history_id(self, job_id: str) -> str | None:
        return self._raw_job(job_id).get("history_id") or None

    def history_needs_sync(self, job_id: str) -> bool:
        job = self._raw_job(job_id)
        return bool(job.get("history_id")) and job.get("history_synced") != "1"

    def mark_history_synced(self, job_id: str) -> None:
        self.client.hset(self._job_key(job_id), mapping={"history_synced": "1"})
        self._touch(job_id)

    def set_task_ids(self, job_id: str, task_ids: list[str]) -> None:
        self.client.hset(
            self._job_key(job_id),
            mapping={"task_ids_json": json.dumps(task_ids), "status": "queued"},
        )
        self._touch(job_id)

    def task_ids(self, job_id: str) -> list[str]:
        job = self._raw_job(job_id)
        return json.loads(job.get("task_ids_json") or "[]")

    def mark_running(self, job_id: str) -> None:
        job = self._raw_job(job_id)
        if job["status"] not in {"cancelled", "completed"}:
            self.client.hset(self._job_key(job_id), mapping={"status": "running"})
            self._touch(job_id)

    def record_success(self, job_id: str, key: str, image_url: str) -> None:
        self._raw_job(job_id)
        self.client.hset(self._results_key(job_id), mapping={key: image_url})
        self.client.hdel(self._errors_key(job_id), key)
        self._touch(job_id)
        self.finalize_if_done(job_id)

    def record_failure(self, job_id: str, key: str, message: str) -> None:
        self._raw_job(job_id)
        self.client.hset(self._errors_key(job_id), mapping={key: message[:500]})
        self._touch(job_id)
        self.finalize_if_done(job_id)

    def finalize_if_done(self, job_id: str) -> str:
        job = self._raw_job(job_id)
        if job.get("cancel_requested") == "1":
            status = "cancelled"
        else:
            completed = len(self.client.hgetall(self._results_key(job_id)))
            failed = len(self.client.hgetall(self._errors_key(job_id)))
            total = int(job["total"])
            if completed >= total:
                status = "completed"
            elif completed + failed >= total:
                status = "partial"
            else:
                return job["status"]
        self.client.hset(self._job_key(job_id), mapping={"status": status})
        self._touch(job_id)
        return status

    def request_cancel(self, job_id: str) -> None:
        self._raw_job(job_id)
        self.client.hset(
            self._job_key(job_id),
            mapping={"cancel_requested": "1", "status": "cancelled"},
        )
        self._touch(job_id)

    def is_cancel_requested(self, job_id: str) -> bool:
        return self._raw_job(job_id).get("cancel_requested") == "1"

    def prepare_retry(self, job_id: str) -> list[str]:
        failed = self.failed_targets(job_id)
        if not failed:
            return []
        self.client.hdel(self._errors_key(job_id), *failed)
        self.client.hset(
            self._job_key(job_id),
            mapping={"cancel_requested": "0", "status": "queued", "task_ids_json": "[]"},
        )
        self._touch(job_id)
        return failed

    def mark_dispatch_failed(self, job_id: str, message: str) -> None:
        for key in self.pending_targets(job_id):
            self.client.hset(self._errors_key(job_id), mapping={key: message[:500]})
        self.client.hset(self._job_key(job_id), mapping={"status": "failed"})
        self._touch(job_id)


def get_image_job_store() -> RedisImageJobStore:
    return RedisImageJobStore()
