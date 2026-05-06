from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import router
from app.api.github_webhook import router as github_router
from app.api.render_webhook import router as render_router

app = FastAPI(title="Indigo Neighborhood PPT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(github_router)
app.include_router(render_router)


@app.get("/health")
def health():
    return {"status": "ok"}
