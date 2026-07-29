from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import AuthUser, create_user, login_user, logout_token, require_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class AuthResponse(BaseModel):
    user: AuthUser
    token: str


@router.post("/register", response_model=AuthResponse)
async def register(req: AuthRequest):
    user, token = create_user(req.email, req.password, req.name)
    return AuthResponse(user=user, token=token)


@router.post("/login", response_model=AuthResponse)
async def login(req: AuthRequest):
    user, token = login_user(req.email, req.password)
    return AuthResponse(user=user, token=token)


@router.get("/me", response_model=AuthUser)
async def me(session=Depends(require_session)):
    return session.user


@router.post("/logout")
async def logout(session=Depends(require_session)):
    logout_token(session.token_hash)
    return {"status": "ok"}
