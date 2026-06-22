from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_default_port_is_project_backend_port(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    monkeypatch.delenv("PORT", raising=False)

    settings = Settings()

    assert settings.port == 28117


def test_backend_port_reads_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_PORT", "28118")

    settings = Settings()

    assert settings.port == 28118


def test_backend_port_takes_precedence_over_port(monkeypatch) -> None:
    monkeypatch.setenv("PORT", "30000")
    monkeypatch.setenv("BACKEND_PORT", "28119")

    settings = Settings()

    assert settings.port == 28119


def test_port_reads_from_environment_when_backend_port_is_missing(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    monkeypatch.setenv("PORT", "28120")

    settings = Settings()

    assert settings.port == 28120


def test_version_file_declares_current_backend_version(monkeypatch) -> None:
    monkeypatch.delenv("APP_VERSION", raising=False)
    version_file = Path(__file__).resolve().parents[1] / "VERSION"
    settings = Settings()

    assert version_file.read_text(encoding="utf-8").strip() == "0.2.3"
    assert settings.app_version == "0.2.3"


def test_local_environment_allows_project_frontend_origins_by_default(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv("APP_ENV", "local")

    settings = Settings()

    assert "http://127.0.0.1:25173" in settings.cors_allowed_origin_list
    assert "http://localhost:25173" in settings.cors_allowed_origin_list
    assert "127.0.0.1" in settings.trusted_host_list
    assert "localhost" in settings.trusted_host_list


def test_non_local_environment_requires_explicit_cors_origins(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_CORS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    settings = Settings()

    assert settings.cors_allowed_origin_list == []


def test_deployment_lists_are_read_from_csv_environment(monkeypatch) -> None:
    monkeypatch.setenv(
        "BACKEND_CORS_ALLOWED_ORIGINS",
        "https://telemetry.example.com, https://admin.example.com ",
    )
    monkeypatch.setenv("BACKEND_TRUSTED_HOSTS", "telemetry.example.com, api.example.com")
    monkeypatch.setenv("BACKEND_ROOT_PATH", "xxx")
    monkeypatch.setenv("BACKEND_PROXY_HEADERS", "true")
    monkeypatch.setenv("BACKEND_FORWARDED_ALLOW_IPS", "127.0.0.1,10.0.0.10")

    settings = Settings()

    assert settings.cors_allowed_origin_list == [
        "https://telemetry.example.com",
        "https://admin.example.com",
    ]
    assert settings.trusted_host_list == ["telemetry.example.com", "api.example.com"]
    assert settings.root_path == "/xxx"
    assert settings.proxy_headers is True
    assert settings.forwarded_allow_ips == "127.0.0.1,10.0.0.10"


def test_ingest_rate_limit_reads_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("INGEST_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("INGEST_RATE_LIMIT_PER_MINUTE", "42")
    monkeypatch.setenv("INGEST_RATE_LIMIT_BACKEND", "redis")
    monkeypatch.setenv("INGEST_RATE_LIMIT_KEY_PREFIX", "telemetry-test")
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:26380/2")

    settings = Settings()

    assert settings.ingest_rate_limit_enabled is True
    assert settings.ingest_rate_limit_per_minute == 42
    assert settings.ingest_rate_limit_backend == "redis"
    assert settings.ingest_rate_limit_key_prefix == "telemetry-test"
    assert settings.redis_url == "redis://127.0.0.1:26380/2"


def test_ingest_rate_limit_rejects_unknown_backend(monkeypatch) -> None:
    monkeypatch.setenv("INGEST_RATE_LIMIT_BACKEND", "unknown")

    with pytest.raises(ValidationError, match="ingest_rate_limit_backend"):
        Settings()


def test_cors_credentials_rejects_wildcard_origin(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_CORS_ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("BACKEND_CORS_ALLOW_CREDENTIALS", "true")

    with pytest.raises(ValidationError, match="cors_allowed_origins"):
        Settings()
