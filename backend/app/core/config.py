from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: str = "openai"
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    fal_key: str = ""
    cors_origins: str = "http://localhost:5173"
    env: str = "development"

    model_config = {"env_file": ".env"}


settings = Settings()
