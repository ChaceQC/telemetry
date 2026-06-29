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
        return "0.5.0"


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
        default="Authorization,X-API-Key,X-CSRF-Token,Content-Type,Accept,Origin",
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
    auth_session_cookie_name: str = Field(
        default="telemetry_session",
        validation_alias="AUTH_SESSION_COOKIE_NAME",
    )
    auth_csrf_cookie_name: str = Field(
        default="telemetry_csrf",
        validation_alias="AUTH_CSRF_COOKIE_NAME",
    )
    auth_csrf_header_name: str = Field(
        default="X-CSRF-Token",
        validation_alias="AUTH_CSRF_HEADER_NAME",
    )
    auth_cookie_path: str = Field(default="/", validation_alias="AUTH_COOKIE_PATH")
    auth_cookie_secure: bool | None = Field(
        default=None,
        validation_alias="AUTH_COOKIE_SECURE",
    )
    auth_cookie_samesite: str = Field(
        default="lax",
        validation_alias="AUTH_COOKIE_SAMESITE",
    )
    auth_login_rate_limit_enabled: bool = Field(
        default=True,
        validation_alias="AUTH_LOGIN_RATE_LIMIT_ENABLED",
    )
    auth_login_rate_limit_per_minute: int = Field(
        default=5,
        ge=1,
        validation_alias="AUTH_LOGIN_RATE_LIMIT_PER_MINUTE",
    )
    auth_login_rate_limit_backend: str = Field(
        default="memory",
        validation_alias="AUTH_LOGIN_RATE_LIMIT_BACKEND",
    )
    ingest_rate_limit_enabled: bool = Field(
        default=False,
        validation_alias="INGEST_RATE_LIMIT_ENABLED",
    )
    ingest_rate_limit_per_minute: int = Field(
        default=600,
        ge=1,
        validation_alias="INGEST_RATE_LIMIT_PER_MINUTE",
    )
    ingest_rate_limit_backend: str = Field(
        default="memory",
        validation_alias="INGEST_RATE_LIMIT_BACKEND",
    )
    ingest_rate_limit_key_prefix: str = Field(
        default="telemetry",
        validation_alias="INGEST_RATE_LIMIT_KEY_PREFIX",
    )
    ingest_api_key_precheck_rate_limit_enabled: bool = Field(
        default=True,
        validation_alias="INGEST_API_KEY_PRECHECK_RATE_LIMIT_ENABLED",
    )
    ingest_api_key_precheck_rate_limit_per_minute: int = Field(
        default=1200,
        ge=1,
        validation_alias="INGEST_API_KEY_PRECHECK_RATE_LIMIT_PER_MINUTE",
    )
    ingest_api_key_precheck_rate_limit_backend: str = Field(
        default="memory",
        validation_alias="INGEST_API_KEY_PRECHECK_RATE_LIMIT_BACKEND",
    )
    redis_url: str = Field(default="redis://127.0.0.1:26380/0", validation_alias="REDIS_URL")
    query_trace_topology_span_scan_limit: int = Field(
        default=10000,
        ge=1,
        validation_alias="QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT",
    )
    health_include_runtime_details: bool = Field(
        default=False,
        validation_alias="HEALTH_INCLUDE_RUNTIME_DETAILS",
    )
    openapi_enabled: bool | None = Field(
        default=None,
        validation_alias="OPENAPI_ENABLED",
    )
    docs_enabled: bool | None = Field(
        default=None,
        validation_alias="DOCS_ENABLED",
    )
    security_headers_enabled: bool = Field(
        default=True,
        validation_alias="SECURITY_HEADERS_ENABLED",
    )
    security_headers_csp: str | None = Field(
        default=None,
        validation_alias="SECURITY_HEADERS_CSP",
    )

    @field_validator(
        "auth_login_rate_limit_backend",
        "ingest_rate_limit_backend",
        "ingest_api_key_precheck_rate_limit_backend",
    )
    @classmethod
    def normalize_rate_limit_backend(cls, value: str) -> str:
        backend = value.strip().lower()
        if backend not in {"memory", "redis"}:
            raise ValueError("rate limit backend 必须是 memory 或 redis")
        return backend

    @field_validator("ingest_rate_limit_key_prefix")
    @classmethod
    def normalize_ingest_rate_limit_key_prefix(cls, value: str) -> str:
        prefix = value.strip().strip(":")
        if not prefix:
            raise ValueError("ingest_rate_limit_key_prefix 不能为空")
        return prefix

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

    @field_validator("auth_session_cookie_name", "auth_csrf_cookie_name")
    @classmethod
    def normalize_cookie_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("cookie name 不能为空")
        if any(character in name for character in (";", ",", " ", "\t", "\r", "\n")):
            raise ValueError("cookie name 包含非法字符")
        return name

    @field_validator("auth_csrf_header_name")
    @classmethod
    def normalize_csrf_header_name(cls, value: str) -> str:
        header_name = value.strip()
        if not header_name:
            raise ValueError("csrf header name 不能为空")
        return header_name

    @field_validator("auth_cookie_path")
    @classmethod
    def normalize_cookie_path(cls, value: str) -> str:
        path = value.strip() or "/"
        if "://" in path:
            raise ValueError("auth_cookie_path 必须是 path，不能是完整 URL")
        if not path.startswith("/"):
            path = f"/{path}"
        return path

    @field_validator("auth_cookie_samesite")
    @classmethod
    def normalize_cookie_samesite(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("auth_cookie_samesite 必须是 lax、strict 或 none")
        return normalized

    @model_validator(mode="after")
    def validate_security_combinations(self) -> Self:
        if self.cors_allow_credentials and "*" in split_csv(self.cors_allowed_origins):
            raise ValueError(
                "cors_allowed_origins 不能在 cors_allow_credentials=true 时包含 wildcard '*'"
            )
        if self.auth_cookie_samesite == "none" and not self.auth_cookie_secure_value:
            raise ValueError("auth_cookie_samesite=none 时 auth_cookie_secure 必须为 true")
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

    @property
    def auth_cookie_secure_value(self) -> bool:
        if self.auth_cookie_secure is not None:
            return self.auth_cookie_secure
        return not self.is_local_environment

    @property
    def openapi_url(self) -> str | None:
        if self.openapi_enabled is not None:
            return "/openapi.json" if self.openapi_enabled else None
        return "/openapi.json" if self.is_local_environment else None

    @property
    def docs_url(self) -> str | None:
        if self.docs_enabled is not None:
            return "/docs" if self.docs_enabled else None
        return "/docs" if self.is_local_environment else None

    @property
    def redoc_url(self) -> str | None:
        if self.docs_enabled is not None:
            return "/redoc" if self.docs_enabled else None
        return "/redoc" if self.is_local_environment else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
