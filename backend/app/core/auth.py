import hashlib
import json
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings


PBKDF2_ITERATIONS = 200_000


class AuthUser(BaseModel):
    id: str
    email: str
    name: str | None = None
    created_at: int


@dataclass
class CurrentSession:
    token_hash: str
    user: AuthUser


def _db_path() -> Path:
    path = Path(settings.auth_db_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def _connection() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_auth_store() -> None:
    with _connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS generation_history (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mode TEXT NOT NULL,
                city TEXT NOT NULL,
                district TEXT NOT NULL,
                title TEXT NOT NULL,
                story_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_history_user_updated ON generation_history(user_id, updated_at DESC);
            """
        )
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_now(),))


def _now() -> int:
    return int(time.time())


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _clean_name(name: str | None) -> str | None:
    if not name:
        return None
    value = name.strip()
    return value or None


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations_raw, salt, digest = stored.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations_raw),
        ).hex()
        return secrets.compare_digest(candidate, digest)
    except Exception:
        return False


def _row_to_user(row: sqlite3.Row) -> AuthUser:
    return AuthUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        created_at=row["created_at"],
    )


def create_user(email: str, password: str, name: str | None = None) -> tuple[AuthUser, str]:
    email = _normalize_email(email)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user_id = secrets.token_urlsafe(16)
    created_at = _now()
    try:
        with _connection() as conn:
            conn.execute(
                "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, _clean_name(name), hash_password(password), created_at),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Email already registered")

    return login_user(email, password)


def login_user(email: str, password: str) -> tuple[AuthUser, str]:
    email = _normalize_email(email)
    with _connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = secrets.token_urlsafe(32)
        now = _now()
        expires_at = now + max(settings.session_ttl_days, 1) * 24 * 60 * 60
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_token_hash(token), row["id"], now, expires_at),
        )
        return _row_to_user(row), token


def _session_from_token(token: str) -> CurrentSession | None:
    token_hash = _token_hash(token)
    now = _now()
    with _connection() as conn:
        row = conn.execute(
            """
            SELECT
                s.token_hash,
                u.id,
                u.email,
                u.name,
                u.created_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            """,
            (token_hash, now),
        ).fetchone()
        if not row:
            return None
        return CurrentSession(token_hash=token_hash, user=_row_to_user(row))


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None


async def require_session(request: Request) -> CurrentSession:
    token = _bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    session = _session_from_token(token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return session


async def require_user(request: Request) -> AuthUser:
    return (await require_session(request)).user


def logout_token(token_hash: str) -> None:
    with _connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def create_history(
    *,
    user_id: str,
    mode: str,
    city: str,
    district: str,
    title: str,
    story: Any,
) -> dict[str, Any]:
    now = _now()
    item_id = secrets.token_urlsafe(16)
    if hasattr(story, "model_dump"):
        payload = story.model_dump(mode="json")
    else:
        payload = story
    story_json = json.dumps(payload, ensure_ascii=False)
    with _connection() as conn:
        conn.execute(
            """
            INSERT INTO generation_history
              (id, user_id, mode, city, district, title, story_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (item_id, user_id, mode, city, district, title, story_json, now, now),
        )
    return {
        "id": item_id,
        "mode": mode,
        "city": city,
        "district": district,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "story": payload,
    }


def list_history(user_id: str) -> list[dict[str, Any]]:
    with _connection() as conn:
        rows = conn.execute(
            """
            SELECT id, mode, city, district, title, created_at, updated_at
            FROM generation_history
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT 50
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_history(user_id: str, item_id: str) -> dict[str, Any]:
    with _connection() as conn:
        row = conn.execute(
            """
            SELECT id, mode, city, district, title, story_json, created_at, updated_at
            FROM generation_history
            WHERE user_id = ? AND id = ?
            """,
            (user_id, item_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="History item not found")
    data = dict(row)
    data["story"] = json.loads(data.pop("story_json"))
    return data


def update_history_story(user_id: str, item_id: str, story: Any) -> bool:
    if hasattr(story, "model_dump"):
        payload = story.model_dump(mode="json")
    else:
        payload = story
    now = _now()
    with _connection() as conn:
        cursor = conn.execute(
            """
            UPDATE generation_history
            SET story_json = ?, updated_at = ?
            WHERE user_id = ? AND id = ?
            """,
            (json.dumps(payload, ensure_ascii=False), now, user_id, item_id),
        )
    return cursor.rowcount > 0
