from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: str = "openai"
    image_provider: str = "fal"
    gemini_image_model: str = "gemini-3.1-flash-image-preview"
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    gemini_api_key: str = ""
    fal_key: str = ""
    unsplash_access_key: str = ""
    cors_origins: str = "http://localhost:5173"
    env: str = "development"
    feishu_webhook_url: str = ""
    github_webhook_secret: str = ""
    render_webhook_secret: str = ""
    render_api_key: str = ""
    vercel_webhook_secret: str = ""
    feishu_app_id: str = ""
    feishu_app_secret: str = ""
    feishu_verification_token: str = ""
    feishu_api_base: str = "https://open.feishu.cn/open-apis"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
