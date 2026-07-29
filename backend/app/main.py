from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.auth import init_auth_store
from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.routes import router
from app.api.github_webhook import router as github_router
from app.api.render_webhook import router as render_router

app = FastAPI(title="Indigo Neighborhood PPT API")
init_auth_store()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)
app.include_router(github_router)
app.include_router(render_router)


@app.get("/health")
def health():
    return {"status": "ok"}
