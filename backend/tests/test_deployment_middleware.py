from typing import Any

from fastapi.testclient import TestClient

from app.core.application import create_app
from app.core.config import Settings


def build_client(**overrides: Any) -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
        **overrides,
    )
    return TestClient(create_app(settings))


def test_auth_login_preflight_allows_local_frontend_origin() -> None:
    client = build_client()

    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:25173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,X-API-Key,Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:25173"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "Authorization" in response.headers["access-control-allow-headers"]
    assert "X-API-Key" in response.headers["access-control-allow-headers"]
    assert "Content-Type" in response.headers["access-control-allow-headers"]


def test_auth_preflight_allows_csrf_header_and_credentials_when_configured() -> None:
    client = build_client(
        cors_allow_credentials=True,
        cors_allowed_origins="https://telemetry.example.com",
        trusted_hosts="testserver,telemetry.example.com",
    )

    response = client.options(
        "/api/v1/auth/logout",
        headers={
            "Origin": "https://telemetry.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-CSRF-Token,Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://telemetry.example.com"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "X-CSRF-Token" in response.headers["access-control-allow-headers"]
    assert "Content-Type" in response.headers["access-control-allow-headers"]


def test_ingest_preflight_allows_x_api_key_header_by_default() -> None:
    client = build_client()

    response = client.options(
        "/api/v1/ingest/events",
        headers={
            "Origin": "http://127.0.0.1:25173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-API-Key,Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:25173"
    assert "X-API-Key" in response.headers["access-control-allow-headers"]
    assert "Content-Type" in response.headers["access-control-allow-headers"]


def test_auth_login_preflight_rejects_unconfigured_origin() -> None:
    client = build_client()

    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_non_local_environment_only_allows_configured_production_origin() -> None:
    client = build_client(
        environment="production",
        cors_allowed_origins="https://telemetry.example.com",
        trusted_hosts="testserver,telemetry.example.com",
    )

    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://telemetry.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://telemetry.example.com"


def test_trusted_host_rejects_unconfigured_host() -> None:
    client = build_client(trusted_hosts="api.example.com")

    response = client.get("/health", headers={"Host": "evil.example.com"})

    assert response.status_code == 400
    assert response.text == "Invalid host header"


def test_root_path_is_exposed_in_openapi_servers() -> None:
    client = build_client(root_path="/xxx")

    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["servers"] == [{"url": "/xxx"}]


def test_non_local_environment_disables_openapi_and_docs_by_default() -> None:
    client = build_client(
        environment="production",
        cors_allowed_origins="https://telemetry.example.com",
        trusted_hosts="testserver,telemetry.example.com",
    )

    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404


def test_openapi_and_docs_can_be_enabled_explicitly() -> None:
    client = build_client(
        environment="production",
        cors_allowed_origins="https://telemetry.example.com",
        trusted_hosts="testserver,telemetry.example.com",
        openapi_enabled=True,
        docs_enabled=True,
    )

    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200


def test_security_headers_are_added_to_api_responses() -> None:
    client = build_client(security_headers_csp="default-src 'none'")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert response.headers["content-security-policy"] == "default-src 'none'"
