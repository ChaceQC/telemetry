from typing import Any, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.auth import UserModel
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.services import auth as auth_service_module
from app.services.auth import DUMMY_PASSWORD_HASH, AuthService, hash_password, verify_password

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"
EXACTLY_32_BYTE_AUTH_SECRET = "12345678901234567890123456789012"


def build_client(
    auth_secret_key: str | None = TEST_AUTH_SECRET,
    **settings_overrides: Any,
) -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
        auth_secret_key=auth_secret_key,
        auth_access_token_expire_minutes=30,
        **settings_overrides,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.db_engine)
    return TestClient(app)


def _tested_app(client: TestClient) -> FastAPI:
    return cast(FastAPI, client.app)


def create_test_user(
    client: TestClient,
    *,
    username: str = "admin",
    password: str = "correct-password",
    is_active: bool = True,
) -> UserRecord:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyAuthRepository(session)
        return repository.create_user(
            username=username,
            email="admin@example.test",
            password_hash=hash_password(password),
            display_name="管理员",
            is_active=is_active,
            is_superuser=True,
        )


def create_bearer_token(client: TestClient, user: UserRecord) -> str:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        token, _ = AuthService(
            SqlAlchemyAuthRepository(session), app.state.settings
        ).create_access_token(user)
    return token


def _set_cookie_header(response: Any, cookie_name: str) -> str:
    for header in response.headers.get_list("set-cookie"):
        if header.startswith(f"{cookie_name}="):
            return str(header)
    raise AssertionError(f"missing Set-Cookie header for {cookie_name}")


def test_login_success_sets_cookie_session_and_me_reads_current_user() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )

    assert login_response.status_code == 200
    session_payload = login_response.json()
    assert session_payload["auth_scheme"] == "cookie"
    assert session_payload["expires_in"] == 1800
    assert session_payload["csrf_header_name"] == "X-CSRF-Token"
    assert session_payload["user"]["username"] == "admin"
    assert "access_token" not in session_payload
    assert "token_type" not in session_payload

    me_response = client.get("/api/v1/auth/me")

    assert me_response.status_code == 200
    assert me_response.json() == {
        "id": 1,
        "username": "admin",
        "email": "admin@example.test",
        "display_name": "管理员",
        "is_active": True,
        "is_superuser": True,
        "created_at": me_response.json()["created_at"],
    }
    assert "password_hash" not in me_response.json()


def test_login_sets_http_only_session_cookie_and_readable_csrf_cookie() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )

    assert response.status_code == 200
    session_cookie = _set_cookie_header(response, "telemetry_session")
    csrf_cookie = _set_cookie_header(response, "telemetry_csrf")
    assert "httponly" in session_cookie.lower()
    assert "httponly" not in csrf_cookie.lower()
    assert "max-age=1800" in session_cookie.lower()
    assert "expires=" in session_cookie.lower()
    assert "path=/" in session_cookie.lower()
    assert "samesite=lax" in session_cookie.lower()
    assert "secure" not in session_cookie.lower()
    assert response.json()["auth_scheme"] == "cookie"
    assert client.cookies.get("telemetry_session")
    assert client.cookies.get("telemetry_csrf")


def test_cookie_session_reads_current_user_without_authorization_header() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["username"] == "admin"


def test_cookie_authenticated_unsafe_request_requires_csrf_header() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    missing_csrf_response = client.post(
        "/api/v1/projects",
        json={"name": "核心平台", "key": "core-platform"},
    )
    csrf_token = client.cookies.get("telemetry_csrf")
    with_csrf_response = client.post(
        "/api/v1/projects",
        headers={"X-CSRF-Token": csrf_token or ""},
        json={"name": "核心平台", "key": "core-platform"},
    )

    assert missing_csrf_response.status_code == 403
    assert missing_csrf_response.json()["detail"] == "CSRF token 无效"
    assert with_csrf_response.status_code == 201


def test_bearer_authenticated_unsafe_request_does_not_require_csrf_header() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    user = create_test_user(client)
    token = create_bearer_token(client, user)

    response = client.post(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "核心平台", "key": "core-platform"},
    )

    assert response.status_code == 201


def test_cookie_session_takes_precedence_over_bearer_for_csrf_protection() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    user = create_test_user(client)
    token = create_bearer_token(client, user)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/v1/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "核心平台", "key": "core-platform"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF token 无效"


def test_logout_requires_csrf_for_cookie_session_and_clears_cookies() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    missing_csrf_response = client.post("/api/v1/auth/logout")
    csrf_token = client.cookies.get("telemetry_csrf")
    logout_response = client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf_token or ""},
    )

    assert missing_csrf_response.status_code == 403
    assert logout_response.status_code == 200
    assert logout_response.json() == {"status": "ok"}
    assert "max-age=0" in _set_cookie_header(logout_response, "telemetry_session").lower()
    assert "max-age=0" in _set_cookie_header(logout_response, "telemetry_csrf").lower()
    assert client.cookies.get("telemetry_session") is None
    assert client.cookies.get("telemetry_csrf") is None


def test_login_rate_limit_rejects_repeated_attempts() -> None:
    client = build_client(auth_login_rate_limit_per_minute=2)
    create_test_user(client)

    first_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )
    second_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )
    limited_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )

    assert first_response.status_code == 401
    assert second_response.status_code == 401
    assert limited_response.status_code == 429
    assert limited_response.json()["detail"] == "登录尝试过于频繁"
    assert limited_response.headers["retry-after"] == "60"


def test_login_rejects_extra_body_fields() -> None:
    client = build_client()

    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "admin",
            "password": "correct-password",
            "remember": True,
        },
    )

    assert response.status_code == 422


def test_login_rejects_wrong_password() -> None:
    client = build_client()
    create_test_user(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_login_rejects_inactive_user_with_same_failure_message() -> None:
    client = build_client()
    create_test_user(client, is_active=False)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_login_rejects_unknown_user_after_dummy_hash_check(monkeypatch: pytest.MonkeyPatch) -> None:
    client = build_client()
    checked_hashes: list[str] = []

    def fake_verify_password(password: str, password_hash: str) -> bool:
        checked_hashes.append(password_hash)
        return False

    monkeypatch.setattr(auth_service_module, "verify_password", fake_verify_password)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "missing-user", "password": "any-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"
    assert checked_hashes == [DUMMY_PASSWORD_HASH]


@pytest.mark.parametrize("auth_secret_key", [None, "short-secret"])
def test_login_rejects_missing_or_weak_auth_secret_key(auth_secret_key: str | None) -> None:
    client = build_client(auth_secret_key=auth_secret_key)
    create_test_user(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "认证服务未配置"


def test_password_is_not_stored_as_plaintext() -> None:
    client = build_client()
    create_test_user(client, password="plaintext-check")
    app = _tested_app(client)

    with app.state.db_session_factory() as session:
        password_hash = session.scalar(select(UserModel.password_hash))

    assert password_hash is not None
    assert password_hash != "plaintext-check"
    assert verify_password("plaintext-check", password_hash)


def test_protected_dependency_rejects_missing_and_invalid_token() -> None:
    client = build_client()

    missing_response = client.get("/api/v1/auth/me")
    assert missing_response.status_code == 401

    invalid_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert invalid_response.status_code == 401
    assert invalid_response.json()["detail"] == "无效或已过期的访问令牌"


def test_openapi_describes_http_bearer_security_scheme() -> None:
    client = build_client()

    schema = client.get("/openapi.json").json()

    security_schemes = schema["components"]["securitySchemes"]
    assert security_schemes["HTTPBearer"] == {"type": "http", "scheme": "bearer"}
    assert all(scheme["type"] != "oauth2" for scheme in security_schemes.values())
    assert schema["paths"]["/api/v1/auth/me"]["get"]["security"] == [{"HTTPBearer": []}]
