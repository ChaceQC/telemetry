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

    assert version_file.read_text(encoding="utf-8").strip() == "0.5.0"
    assert settings.app_version == "0.5.0"


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


def test_auth_cookie_and_rate_limit_settings_read_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_SESSION_COOKIE_NAME", "session_id")
    monkeypatch.setenv("AUTH_CSRF_COOKIE_NAME", "csrf_id")
    monkeypatch.setenv("AUTH_CSRF_HEADER_NAME", "X-Alt-CSRF")
    monkeypatch.setenv("AUTH_COOKIE_PATH", "api")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_COOKIE_SAMESITE", "Strict")
    monkeypatch.setenv("AUTH_LOGIN_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("AUTH_LOGIN_RATE_LIMIT_PER_MINUTE", "9")
    monkeypatch.setenv("AUTH_LOGIN_RATE_LIMIT_BACKEND", "redis")
    monkeypatch.setenv("INGEST_API_KEY_PRECHECK_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("INGEST_API_KEY_PRECHECK_RATE_LIMIT_PER_MINUTE", "123")
    monkeypatch.setenv("INGEST_API_KEY_PRECHECK_RATE_LIMIT_BACKEND", "redis")
    monkeypatch.setenv("HEALTH_INCLUDE_RUNTIME_DETAILS", "true")
    monkeypatch.setenv("OPENAPI_ENABLED", "true")
    monkeypatch.setenv("DOCS_ENABLED", "true")
    monkeypatch.setenv("SECURITY_HEADERS_ENABLED", "true")
    monkeypatch.setenv("SECURITY_HEADERS_CSP", "default-src 'none'")

    settings = Settings()

    assert settings.auth_session_cookie_name == "session_id"
    assert settings.auth_csrf_cookie_name == "csrf_id"
    assert settings.auth_csrf_header_name == "X-Alt-CSRF"
    assert settings.auth_cookie_path == "/api"
    assert settings.auth_cookie_secure_value is True
    assert settings.auth_cookie_samesite == "strict"
    assert settings.auth_login_rate_limit_per_minute == 9
    assert settings.auth_login_rate_limit_backend == "redis"
    assert settings.ingest_api_key_precheck_rate_limit_per_minute == 123
    assert settings.ingest_api_key_precheck_rate_limit_backend == "redis"
    assert settings.health_include_runtime_details is True
    assert settings.openapi_url == "/openapi.json"
    assert settings.docs_url == "/docs"
    assert settings.redoc_url == "/redoc"
    assert settings.security_headers_csp == "default-src 'none'"


def test_cookie_secure_defaults_to_false_locally_and_true_in_production(monkeypatch) -> None:
    monkeypatch.delenv("AUTH_COOKIE_SECURE", raising=False)
    monkeypatch.setenv("APP_ENV", "local")
    local_settings = Settings()

    monkeypatch.setenv("APP_ENV", "production")
    production_settings = Settings()

    assert local_settings.auth_cookie_secure_value is False
    assert production_settings.auth_cookie_secure_value is True


def test_query_trace_topology_scan_limit_reads_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT", "250")

    settings = Settings()

    assert settings.query_trace_topology_span_scan_limit == 250


def test_query_trace_topology_scan_limit_rejects_non_positive(monkeypatch) -> None:
    monkeypatch.setenv("QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT", "0")

    with pytest.raises(ValidationError, match="QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT"):
        Settings()


def test_ingest_rate_limit_rejects_unknown_backend(monkeypatch) -> None:
    monkeypatch.setenv("INGEST_RATE_LIMIT_BACKEND", "unknown")

    with pytest.raises(ValidationError, match="INGEST_RATE_LIMIT_BACKEND"):
        Settings()


def test_auth_cookie_samesite_none_requires_secure(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("AUTH_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")

    with pytest.raises(ValidationError, match="auth_cookie_samesite"):
        Settings()


def test_cors_credentials_rejects_wildcard_origin(monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_CORS_ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("BACKEND_CORS_ALLOW_CREDENTIALS", "true")

    with pytest.raises(ValidationError, match="cors_allowed_origins"):
        Settings()
