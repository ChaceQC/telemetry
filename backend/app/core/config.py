from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
VERSION_FILE = BACKEND_ROOT / "VERSION"


def read_backend_version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = Field(default="telemetry-backend", validation_alias="APP_NAME")
    app_version: str = Field(default_factory=read_backend_version, validation_alias="APP_VERSION")
    environment: str = Field(default="local", validation_alias="APP_ENV")
    host: str = Field(default="127.0.0.1", validation_alias="BACKEND_HOST")
    port: int = Field(default=28117, validation_alias=AliasChoices("BACKEND_PORT", "PORT"))
    reload: bool = Field(default=False, validation_alias="BACKEND_RELOAD")
    log_level: str = Field(default="info", validation_alias="LOG_LEVEL")
    database_url: str = Field(
        default="sqlite:///./telemetry-dev.db",
        validation_alias="DATABASE_URL",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
