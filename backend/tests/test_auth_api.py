from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.auth import UserModel
from app.repositories.auth import SqlAlchemyAuthRepository
from app.services import auth as auth_service_module
from app.services.auth import DUMMY_PASSWORD_HASH, hash_password, verify_password

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"
EXACTLY_32_BYTE_AUTH_SECRET = "12345678901234567890123456789012"


def build_client(auth_secret_key: str | None = TEST_AUTH_SECRET) -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
        auth_secret_key=auth_secret_key,
        auth_access_token_expire_minutes=30,
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
) -> None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyAuthRepository(session)
        repository.create_user(
            username=username,
            email="admin@example.test",
            password_hash=hash_password(password),
            display_name="管理员",
            is_active=is_active,
            is_superuser=True,
        )


def test_login_success_returns_bearer_token_and_me_reads_current_user() -> None:
    client = build_client(auth_secret_key=EXACTLY_32_BYTE_AUTH_SECRET)
    create_test_user(client)

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-password"},
    )

    assert login_response.status_code == 200
    token_payload = login_response.json()
    assert token_payload["token_type"] == "bearer"
    assert token_payload["expires_in"] == 1800
    assert token_payload["access_token"]

    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_payload['access_token']}"},
    )

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
