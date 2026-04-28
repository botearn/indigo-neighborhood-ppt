from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    fal_key: str = ""
    cors_origins: str = "http://localhost:5173"
    env: str = "development"

    model_config = {"env_file": ".env"}


settings = Settings()
