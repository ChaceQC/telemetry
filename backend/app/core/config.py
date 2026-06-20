from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
VERSION_FILE = BACKEND_ROOT / "VERSION"
LOCAL_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_FRONTEND_ORIGINS = (
    "http://127.0.0.1:25173",
    "http://localhost:25173",
    "http://127.0.0.1:25174",
    "http://localhost:25174",
)
LOCAL_TRUSTED_HOSTS = ("localhost", "127.0.0.1", "[::1]", "testserver")
NON_LOCAL_DEFAULT_TRUSTED_HOSTS = ("localhost", "127.0.0.1")


def read_backend_version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return "0.1.0"


def split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


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
    cors_allowed_origins: str = Field(
        default="",
        validation_alias=AliasChoices("BACKEND_CORS_ALLOWED_ORIGINS", "CORS_ALLOWED_ORIGINS"),
    )
    cors_allowed_methods: str = Field(
        default="GET,POST,PUT,PATCH,DELETE,OPTIONS",
        validation_alias=AliasChoices("BACKEND_CORS_ALLOWED_METHODS", "CORS_ALLOWED_METHODS"),
    )
    cors_allowed_headers: str = Field(
        default="Authorization,X-API-Key,Content-Type,Accept,Origin",
        validation_alias=AliasChoices("BACKEND_CORS_ALLOWED_HEADERS", "CORS_ALLOWED_HEADERS"),
    )
    cors_allow_credentials: bool = Field(
        default=False,
        validation_alias=AliasChoices("BACKEND_CORS_ALLOW_CREDENTIALS", "CORS_ALLOW_CREDENTIALS"),
    )
    trusted_hosts: str = Field(
        default="",
        validation_alias=AliasChoices("BACKEND_TRUSTED_HOSTS", "TRUSTED_HOSTS"),
    )
    root_path: str = Field(
        default="", validation_alias=AliasChoices("BACKEND_ROOT_PATH", "ROOT_PATH")
    )
    proxy_headers: bool = Field(
        default=False,
        validation_alias=AliasChoices("BACKEND_PROXY_HEADERS", "PROXY_HEADERS"),
    )
    forwarded_allow_ips: str = Field(
        default="127.0.0.1",
        validation_alias=AliasChoices("BACKEND_FORWARDED_ALLOW_IPS", "FORWARDED_ALLOW_IPS"),
    )
    database_url: str = Field(
        default="sqlite:///./telemetry-dev.db",
        validation_alias="DATABASE_URL",
    )
    auth_secret_key: SecretStr | None = Field(default=None, validation_alias="AUTH_SECRET_KEY")
    auth_token_algorithm: str = Field(default="HS256", validation_alias="AUTH_TOKEN_ALGORITHM")
    auth_access_token_expire_minutes: int = Field(
        default=60,
        ge=1,
        validation_alias="AUTH_ACCESS_TOKEN_EXPIRE_MINUTES",
    )

    @field_validator("root_path")
    @classmethod
    def normalize_root_path(cls, value: str) -> str:
        path = value.strip()
        if not path or path == "/":
            return ""
        if "://" in path:
            raise ValueError("root_path 必须是 URL path，不能是完整 URL")
        if not path.startswith("/"):
            path = f"/{path}"
        return path.rstrip("/")

    @model_validator(mode="after")
    def reject_wildcard_cors_with_credentials(self) -> Self:
        if self.cors_allow_credentials and "*" in split_csv(self.cors_allowed_origins):
            raise ValueError(
                "cors_allowed_origins 不能在 cors_allow_credentials=true 时包含 wildcard '*'"
            )
        return self

    @property
    def is_local_environment(self) -> bool:
        return self.environment.lower() in LOCAL_ENVIRONMENTS

    @property
    def cors_allowed_origin_list(self) -> list[str]:
        configured_origins = split_csv(self.cors_allowed_origins)
        if configured_origins:
            return configured_origins
        if self.is_local_environment:
            return list(LOCAL_FRONTEND_ORIGINS)
        return []

    @property
    def cors_allowed_method_list(self) -> list[str]:
        return split_csv(self.cors_allowed_methods)

    @property
    def cors_allowed_header_list(self) -> list[str]:
        return split_csv(self.cors_allowed_headers)

    @property
    def trusted_host_list(self) -> list[str]:
        configured_hosts = split_csv(self.trusted_hosts)
        if configured_hosts:
            return configured_hosts
        if self.is_local_environment:
            return list(LOCAL_TRUSTED_HOSTS)
        return list(NON_LOCAL_DEFAULT_TRUSTED_HOSTS)


@lru_cache
def get_settings() -> Settings:
    return Settings()
