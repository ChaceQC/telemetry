from argparse import Namespace
from pathlib import Path
from typing import cast

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.repositories.api_keys import SqlAlchemyApiKeyRepository
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.schemas.permissions import ProjectRole
from app.services.api_keys import ApiKeyService, ApiKeyVerification, hash_api_key
from app.services.auth import AuthService, hash_password
from app.services.permissions import PermissionService

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def build_client() -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
        auth_secret_key=TEST_AUTH_SECRET,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.db_engine)
    return TestClient(app)


def _tested_app(client: TestClient) -> FastAPI:
    return cast(FastAPI, client.app)


def create_test_user(
    client: TestClient,
    *,
    username: str,
    is_superuser: bool = False,
) -> UserRecord:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        return SqlAlchemyAuthRepository(session).create_user(
            username=username,
            email=f"{username}@example.test",
            password_hash=hash_password("correct-password"),
            display_name=username,
            is_superuser=is_superuser,
        )


def create_auth_headers(
    client: TestClient,
    *,
    username: str,
    is_superuser: bool = False,
) -> tuple[UserRecord, dict[str, str]]:
    user = create_test_user(client, username=username, is_superuser=is_superuser)
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        token, _ = AuthService(
            SqlAlchemyAuthRepository(session),
            app.state.settings,
        ).create_access_token(user)
    return user, {"Authorization": f"Bearer {token}"}


def create_project(client: TestClient, auth_headers: dict[str, str]) -> dict[str, object]:
    response = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "核心平台", "key": "core-platform"},
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


def grant_project_role(
    client: TestClient,
    *,
    project_id: int,
    user_id: int,
    role: ProjectRole,
) -> None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        SqlAlchemyPermissionRepository(session).add_project_member(
            project_id=project_id,
            user_id=user_id,
            role=role,
        )


def verify_api_key(client: TestClient, raw_key: str) -> ApiKeyVerification | None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        service = ApiKeyService(
            SqlAlchemyApiKeyRepository(session),
            SqlAlchemyManagementRepository(session),
            PermissionService(SqlAlchemyPermissionRepository(session)),
        )
        return service.verify_key(raw_key)


def test_create_api_key_returns_plaintext_once_and_stores_only_hash() -> None:
    client = build_client()
    _, admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers)

    response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=admin_headers,
        json={"name": "生产摄入"},
    )

    assert response.status_code == 201
    created = response.json()
    raw_key = created["api_key"]
    assert raw_key.startswith("tlm_")
    assert created["key_prefix"] == raw_key[:12]
    assert created["status"] == "active"
    assert "key_hash" not in created

    list_response = client.get(f"/api/v1/projects/{project['id']}/api-keys", headers=admin_headers)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed == [{key: value for key, value in created.items() if key != "api_key"}]

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = SqlAlchemyApiKeyRepository(session).list_project_api_keys(
            cast(int, project["id"])
        )

    assert len(records) == 1
    assert records[0].key_hash == hash_api_key(raw_key)
    assert records[0].key_hash != raw_key
    assert records[0].key_prefix in raw_key


def test_verify_key_succeeds_then_fails_after_revoke() -> None:
    client = build_client()
    _, admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers)
    created = client.post(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=admin_headers,
        json={"name": "生产摄入"},
    ).json()

    verified = verify_api_key(client, created["api_key"])

    assert verified is not None
    assert verified.project_id == project["id"]
    assert verified.api_key_id == created["id"]

    revoke_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/{created['id']}/revoke",
        headers=admin_headers,
    )
    assert revoke_response.status_code == 200
    revoked = revoke_response.json()
    assert revoked["status"] == "revoked"
    assert revoked["revoked_at"] is not None
    assert "api_key" not in revoked

    assert verify_api_key(client, created["api_key"]) is None


def test_api_key_management_requires_admin_role() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    viewer, viewer_headers = create_auth_headers(client, username="viewer")
    editor, editor_headers = create_auth_headers(client, username="editor")
    _, superuser_headers = create_auth_headers(client, username="root", is_superuser=True)
    project = create_project(client, owner_headers)
    grant_project_role(
        client,
        project_id=cast(int, project["id"]),
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    grant_project_role(
        client,
        project_id=cast(int, project["id"]),
        user_id=editor.id,
        role=ProjectRole.editor,
    )
    owner_create_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=owner_headers,
        json={"name": "owner key"},
    )
    assert owner_create_response.status_code == 201

    for headers in (viewer_headers, editor_headers):
        assert (
            client.get(f"/api/v1/projects/{project['id']}/api-keys", headers=headers).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/v1/projects/{project['id']}/api-keys",
                headers=headers,
                json={"name": "被拒绝"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/v1/projects/{project['id']}/api-keys/"
                f"{owner_create_response.json()['id']}/revoke",
                headers=headers,
            ).status_code
            == 403
        )

    superuser_list_response = client.get(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=superuser_headers,
    )
    superuser_revoke_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/{owner_create_response.json()['id']}/revoke",
        headers=superuser_headers,
    )

    assert owner_create_response.status_code == 201
    assert superuser_list_response.status_code == 200
    assert len(superuser_list_response.json()) == 1
    assert superuser_revoke_response.status_code == 200
    assert superuser_revoke_response.json()["status"] == "revoked"


def test_api_key_management_hides_missing_or_unscoped_project() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    _, stranger_headers = create_auth_headers(client, username="stranger")
    project = create_project(client, owner_headers)
    created = client.post(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=owner_headers,
        json={"name": "owner key"},
    ).json()

    missing_response = client.get("/api/v1/projects/999/api-keys", headers=owner_headers)
    unauthorized_list_response = client.get(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=stranger_headers,
    )
    unauthorized_create_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=stranger_headers,
        json={"name": "被拒绝"},
    )
    unauthorized_revoke_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/{created['id']}/revoke",
        headers=stranger_headers,
    )
    missing_key_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/999/revoke",
        headers=owner_headers,
    )

    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "项目不存在"
    assert unauthorized_list_response.status_code == 404
    assert unauthorized_list_response.json()["detail"] == "项目不存在"
    assert unauthorized_create_response.status_code == 404
    assert unauthorized_create_response.json()["detail"] == "项目不存在"
    assert unauthorized_revoke_response.status_code == 404
    assert unauthorized_revoke_response.json()["detail"] == "项目不存在"
    assert missing_key_response.status_code == 404
    assert missing_key_response.json()["detail"] == "API Key 不存在"


def test_api_key_migration_sqlite_upgrade_and_downgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "api-keys-migration.db"
    database_url = f"sqlite:///{database_path}"
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    config.cmd_opts = Namespace(x=[f"database_url={database_url}"])

    command.upgrade(config, "head")

    app = create_app(
        Settings(
            app_name="telemetry-backend-test",
            app_version="0.1.0",
            database_url=database_url,
            auth_secret_key=TEST_AUTH_SECRET,
        )
    )
    try:
        table_names = inspect(app.state.db_engine).get_table_names()
        assert "api_keys" in table_names
    finally:
        app.state.db_engine.dispose()

    command.downgrade(config, "base")

    app = create_app(
        Settings(
            app_name="telemetry-backend-test",
            app_version="0.1.0",
            database_url=database_url,
            auth_secret_key=TEST_AUTH_SECRET,
        )
    )
    try:
        table_names = inspect(app.state.db_engine).get_table_names()
        assert "api_keys" not in table_names
    finally:
        app.state.db_engine.dispose()
