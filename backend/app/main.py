from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.auth import init_auth_store
from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.routes import router
from app.api.github_webhook import router as github_router
from app.api.render_webhook import router as render_router
from app.api.feishu_event import router as feishu_router
from app.services import image_job_runner, image_jobs

init_auth_store()
image_jobs.get_image_job_store()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    image_job_runner.resume_pending_jobs()
    yield


app = FastAPI(title="Indigo Neighborhood PPT API", lifespan=lifespan)

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
app.include_router(feishu_router)


@app.get("/health")
def health():
    return {"status": "ok"}
