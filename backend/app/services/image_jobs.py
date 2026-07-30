import json
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.models import IndigoImageJobResponse, IndigoStoryUnit


IMAGE_FIELDS = ("image_url", "mood_image_url", "col2_image_url", "col3_image_url")


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


class SqliteImageJobStore:
    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path or settings.auth_db_path)
        if not self.db_path.is_absolute():
            self.db_path = Path.cwd() / self.db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 10000")
        return conn

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _init_schema(self) -> None:
        try:
            with self._connection() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS image_jobs (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        total INTEGER NOT NULL,
                        story_json TEXT NOT NULL,
                        target_keys_json TEXT NOT NULL,
                        history_id TEXT,
                        cancel_requested INTEGER NOT NULL DEFAULT 0,
                        history_synced INTEGER NOT NULL DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS image_job_results (
                        job_id TEXT NOT NULL REFERENCES image_jobs(id) ON DELETE CASCADE,
                        target_key TEXT NOT NULL,
                        image_url TEXT NOT NULL,
                        PRIMARY KEY (job_id, target_key)
                    );

                    CREATE TABLE IF NOT EXISTS image_job_errors (
                        job_id TEXT NOT NULL REFERENCES image_jobs(id) ON DELETE CASCADE,
                        target_key TEXT NOT NULL,
                        message TEXT NOT NULL,
                        PRIMARY KEY (job_id, target_key)
                    );

                    CREATE INDEX IF NOT EXISTS idx_image_jobs_status
                    ON image_jobs(status, updated_at);
                    """
                )
        except sqlite3.Error as exc:
            raise ImageJobUnavailable("Image jobs could not open local storage") from exc

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
        existing: dict[str, str] = {}
        for beat_index, beat in enumerate(story.beats):
            for image_field in IMAGE_FIELDS:
                value = getattr(beat, image_field, None)
                if not value:
                    continue
                if value.startswith("data:"):
                    from app.services.image_assets import persist_image

                    value = persist_image(value)
                existing[target_key(beat_index, image_field)] = value
                setattr(beat, image_field, None)

        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO image_jobs (
                    id, user_id, status, total, story_json, target_keys_json,
                    history_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    user_id,
                    "queued",
                    len(targets),
                    story.model_dump_json(),
                    json.dumps(targets),
                    history_id,
                    now,
                    now,
                ),
            )
            conn.executemany(
                """
                INSERT INTO image_job_results (job_id, target_key, image_url)
                VALUES (?, ?, ?)
                """,
                [(job_id, key, value) for key, value in existing.items()],
            )
        self.finalize_if_done(job_id)
        return self.get(job_id)

    def _raw_job(self, job_id: str) -> sqlite3.Row:
        with self._connection() as conn:
            job = conn.execute(
                "SELECT * FROM image_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        if not job:
            raise ImageJobNotFound(job_id)
        return job

    def _results(self, job_id: str) -> dict[str, str]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT target_key, image_url FROM image_job_results WHERE job_id = ?",
                (job_id,),
            ).fetchall()
        return {row["target_key"]: row["image_url"] for row in rows}

    def _errors(self, job_id: str) -> dict[str, str]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT target_key, message FROM image_job_errors WHERE job_id = ?",
                (job_id,),
            ).fetchall()
        return {row["target_key"]: row["message"] for row in rows}

    def get(self, job_id: str) -> IndigoImageJobResponse:
        job = self._raw_job(job_id)
        results = self._results(job_id)
        errors = self._errors(job_id)
        story = IndigoStoryUnit.model_validate_json(job["story_json"])
        for key, image_url in results.items():
            beat_index, image_field = parse_target_key(key)
            setattr(story.beats[beat_index], image_field, image_url)

        return IndigoImageJobResponse(
            id=job_id,
            status=job["status"],
            total=job["total"],
            completed=len(results),
            failed=len(errors),
            created_at=job["created_at"],
            updated_at=job["updated_at"],
            story=story,
            errors=errors,
        )

    def owner_id(self, job_id: str) -> str:
        return self._raw_job(job_id)["user_id"]

    def pending_targets(self, job_id: str) -> list[str]:
        job = self._raw_job(job_id)
        targets = json.loads(job["target_keys_json"])
        finished = set(self._results(job_id)) | set(self._errors(job_id))
        return [key for key in targets if key not in finished]

    def failed_targets(self, job_id: str) -> list[str]:
        self._raw_job(job_id)
        return list(self._errors(job_id))

    def story(self, job_id: str) -> IndigoStoryUnit:
        return IndigoStoryUnit.model_validate_json(self._raw_job(job_id)["story_json"])

    def history_id(self, job_id: str) -> str | None:
        return self._raw_job(job_id)["history_id"] or None

    def history_needs_sync(self, job_id: str) -> bool:
        job = self._raw_job(job_id)
        return bool(job["history_id"]) and job["history_synced"] != 1

    def mark_history_synced(self, job_id: str) -> None:
        self._update_job(job_id, history_synced=1)

    def _update_job(self, job_id: str, **values: object) -> None:
        if not values:
            return
        values["updated_at"] = int(time.time())
        columns = ", ".join(f"{name} = ?" for name in values)
        with self._connection() as conn:
            result = conn.execute(
                f"UPDATE image_jobs SET {columns} WHERE id = ?",
                (*values.values(), job_id),
            )
        if result.rowcount == 0:
            raise ImageJobNotFound(job_id)

    def mark_running(self, job_id: str) -> None:
        job = self._raw_job(job_id)
        if job["status"] not in {"cancelled", "completed"}:
            self._update_job(job_id, status="running")

    def record_success(self, job_id: str, key: str, image_url: str) -> bool:
        with self._connection() as conn:
            job = conn.execute(
                "SELECT cancel_requested FROM image_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            if not job:
                raise ImageJobNotFound(job_id)
            if job["cancel_requested"] == 1:
                return False
            conn.execute(
                """
                INSERT INTO image_job_results (job_id, target_key, image_url)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id, target_key) DO UPDATE SET image_url = excluded.image_url
                """,
                (job_id, key, image_url),
            )
            conn.execute(
                "DELETE FROM image_job_errors WHERE job_id = ? AND target_key = ?",
                (job_id, key),
            )
        self._update_job(job_id)
        self.finalize_if_done(job_id)
        return True

    def record_failure(self, job_id: str, key: str, message: str) -> None:
        with self._connection() as conn:
            job = conn.execute(
                "SELECT cancel_requested FROM image_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            if not job:
                raise ImageJobNotFound(job_id)
            if job["cancel_requested"] == 1:
                return
            conn.execute(
                """
                INSERT INTO image_job_errors (job_id, target_key, message)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id, target_key) DO UPDATE SET message = excluded.message
                """,
                (job_id, key, message[:500]),
            )
        self._update_job(job_id)
        self.finalize_if_done(job_id)

    def finalize_if_done(self, job_id: str) -> str:
        job = self._raw_job(job_id)
        if job["cancel_requested"] == 1:
            status = "cancelled"
        else:
            completed = len(self._results(job_id))
            failed = len(self._errors(job_id))
            total = job["total"]
            if completed >= total:
                status = "completed"
            elif completed + failed >= total:
                status = "partial"
            else:
                return job["status"]
        self._update_job(job_id, status=status)
        return status

    def request_cancel(self, job_id: str) -> None:
        self._update_job(job_id, cancel_requested=1, status="cancelled")

    def is_cancel_requested(self, job_id: str) -> bool:
        return self._raw_job(job_id)["cancel_requested"] == 1

    def prepare_retry(self, job_id: str) -> list[str]:
        failed = self.failed_targets(job_id)
        if not failed:
            return []
        with self._connection() as conn:
            conn.executemany(
                "DELETE FROM image_job_errors WHERE job_id = ? AND target_key = ?",
                [(job_id, key) for key in failed],
            )
        self._update_job(job_id, cancel_requested=0, status="queued")
        return failed

    def mark_dispatch_failed(self, job_id: str, message: str) -> None:
        for key in self.pending_targets(job_id):
            with self._connection() as conn:
                conn.execute(
                    """
                    INSERT INTO image_job_errors (job_id, target_key, message)
                    VALUES (?, ?, ?)
                    ON CONFLICT(job_id, target_key) DO UPDATE SET message = excluded.message
                    """,
                    (job_id, key, message[:500]),
                )
        self._update_job(job_id, status="failed")

    def resumable_job_ids(self) -> list[str]:
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT id FROM image_jobs
                WHERE status IN ('queued', 'running')
                ORDER BY created_at
                """
            ).fetchall()
            conn.execute(
                """
                UPDATE image_jobs SET status = 'queued', updated_at = ?
                WHERE status = 'running'
                """,
                (int(time.time()),),
            )
        return [row["id"] for row in rows]


def get_image_job_store() -> SqliteImageJobStore:
    return SqliteImageJobStore()
