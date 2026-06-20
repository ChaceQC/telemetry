import os
import re
from argparse import Namespace
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import cast
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import ProjectMemberRecord, SqlAlchemyPermissionRepository
from app.schemas.management import ProjectCreate, ResourceStatus
from app.schemas.permissions import ProjectRole
from app.services.auth import AuthService, hash_password
from app.services.errors import (
    DuplicateResourceError,
    ResourceConflictError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)
from app.services.management import ManagementService
from app.services.permissions import PermissionService

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"
MYSQL_TEST_DATABASE_URL_ENV = "TELEMETRY_MYSQL_TEST_DATABASE_URL"
BACKEND_ROOT = Path(__file__).resolve().parents[1]
MYSQL_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")
MYSQL_TABLE_NAMES = (
    "rbac_project_members",
    "rbac_team_members",
    "rbac_teams",
    "management_services",
    "management_environments",
    "management_projects",
    "auth_users",
)

PROTECTED_MANAGEMENT_REQUESTS: list[tuple[str, str, dict[str, object] | None]] = [
    ("GET", "/api/v1/projects", None),
    ("POST", "/api/v1/projects", {"name": "核心平台", "key": "core-platform"}),
    ("GET", "/api/v1/environments", None),
    (
        "POST",
        "/api/v1/environments",
        {"project_id": 1, "name": "生产环境", "key": "prod"},
    ),
    ("GET", "/api/v1/services", None),
    (
        "POST",
        "/api/v1/services",
        {
            "project_id": 1,
            "environment_id": 1,
            "name": "API 服务",
            "key": "api-service",
        },
    ),
]


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


@pytest.fixture(scope="session")
def mysql_database_url() -> Iterator[str]:
    raw_database_url = os.getenv(MYSQL_TEST_DATABASE_URL_ENV)
    if not raw_database_url:
        pytest.skip(f"{MYSQL_TEST_DATABASE_URL_ENV} 未设置，跳过真实 MySQL 集成复验")

    admin_url = make_url(raw_database_url)
    if not admin_url.drivername.startswith("mysql"):
        pytest.skip(f"{MYSQL_TEST_DATABASE_URL_ENV} 必须是 MySQL SQLAlchemy URL")

    database_name = f"telemetry_test_{uuid4().hex}"
    admin_engine = create_engine(
        admin_url.set(database=None),
        future=True,
        pool_pre_ping=True,
    )

    created_database = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE {_mysql_identifier(database_name)} "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
            created_database = True

        database_url = admin_url.set(database=database_name).render_as_string(hide_password=False)
        _upgrade_mysql_database(database_url)
        yield database_url
    finally:
        if created_database:
            with admin_engine.begin() as connection:
                connection.execute(
                    text(f"DROP DATABASE IF EXISTS {_mysql_identifier(database_name)}")
                )
        admin_engine.dispose()


@pytest.fixture
def mysql_client(mysql_database_url: str) -> Iterator[TestClient]:
    _clear_mysql_data(mysql_database_url)
    settings = Settings(
        app_name="telemetry-backend-mysql-test",
        app_version="0.1.0",
        database_url=mysql_database_url,
        auth_secret_key=TEST_AUTH_SECRET,
    )
    app = create_app(settings)
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.state.db_engine.dispose()
        _clear_mysql_data(mysql_database_url)


def _upgrade_mysql_database(database_url: str) -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    config.cmd_opts = Namespace(x=[f"database_url={database_url}"])
    command.upgrade(config, "head")


def _mysql_identifier(identifier: str) -> str:
    if not MYSQL_IDENTIFIER_PATTERN.fullmatch(identifier):
        raise ValueError("unsafe MySQL identifier")
    return f"`{identifier}`"


def _clear_mysql_data(database_url: str) -> None:
    cleanup_engine = create_engine(database_url, future=True, pool_pre_ping=True)
    try:
        with cleanup_engine.connect() as connection:
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            try:
                for table_name in MYSQL_TABLE_NAMES:
                    connection.execute(text(f"TRUNCATE TABLE {_mysql_identifier(table_name)}"))
            finally:
                connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
            connection.commit()
    finally:
        cleanup_engine.dispose()


def _tested_app(client: TestClient) -> FastAPI:
    return cast(FastAPI, client.app)


def create_test_user(
    client: TestClient,
    *,
    username: str = "admin",
    is_active: bool = True,
    is_superuser: bool = False,
) -> UserRecord:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyAuthRepository(session)
        return repository.create_user(
            username=username,
            email=f"{username}@example.test",
            password_hash=hash_password("correct-password"),
            display_name="管理员",
            is_active=is_active,
            is_superuser=is_superuser,
        )


def create_auth_headers(
    client: TestClient,
    *,
    username: str = "admin",
    is_active: bool = True,
    is_superuser: bool = False,
) -> tuple[UserRecord, dict[str, str]]:
    user = create_test_user(
        client,
        username=username,
        is_active=is_active,
        is_superuser=is_superuser,
    )
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        auth_service = AuthService(SqlAlchemyAuthRepository(session), app.state.settings)
        access_token, _ = auth_service.create_access_token(user)
    return user, {"Authorization": f"Bearer {access_token}"}


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


def request_management_endpoint(
    client: TestClient,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, object] | None = None,
) -> Response:
    if json_body is None:
        return client.request(method, path, headers=headers)
    return client.request(method, path, headers=headers, json=json_body)


@pytest.mark.parametrize(("method", "path", "json_body"), PROTECTED_MANAGEMENT_REQUESTS)
def test_management_api_rejects_missing_token(
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    client = build_client()

    response = request_management_endpoint(client, method, path, json_body=json_body)

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path", "json_body"), PROTECTED_MANAGEMENT_REQUESTS)
def test_management_api_rejects_invalid_token(
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    client = build_client()

    response = request_management_endpoint(
        client,
        method,
        path,
        headers={"Authorization": "Bearer invalid-token"},
        json_body=json_body,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "无效或已过期的访问令牌"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path", "json_body"), PROTECTED_MANAGEMENT_REQUESTS)
def test_management_api_rejects_inactive_user_token(
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, is_active=False)

    response = request_management_endpoint(
        client,
        method,
        path,
        headers=auth_headers,
        json_body=json_body,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户已停用"
    assert response.headers["www-authenticate"] == "Bearer"


def test_management_openapi_describes_bearer_security_requirement() -> None:
    client = build_client()

    schema = client.get("/openapi.json").json()

    for method, path, _ in PROTECTED_MANAGEMENT_REQUESTS:
        operation = schema["paths"][path][method.lower()]
        assert operation["security"] == [{"HTTPBearer": []}]


def test_create_and_list_management_resources() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)

    project_response = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={
            "name": "核心平台",
            "key": "core-platform",
            "description": "主项目",
        },
    )
    assert project_response.status_code == 201
    project = project_response.json()
    assert project["id"] == 1
    assert project["name"] == "核心平台"
    assert project["key"] == "core-platform"
    assert project["description"] == "主项目"
    assert project["status"] == "active"
    assert datetime.fromisoformat(project["created_at"])

    environment_response = client.post(
        "/api/v1/environments",
        headers=auth_headers,
        json={
            "project_id": project["id"],
            "name": "生产环境",
            "key": "prod",
        },
    )
    assert environment_response.status_code == 201
    environment = environment_response.json()
    assert environment["id"] == 1
    assert environment["project_id"] == project["id"]
    assert environment["status"] == "active"

    service_response = client.post(
        "/api/v1/services",
        headers=auth_headers,
        json={
            "project_id": project["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
            "status": "inactive",
        },
    )
    assert service_response.status_code == 201
    service = service_response.json()
    assert service["id"] == 1
    assert service["project_id"] == project["id"]
    assert service["environment_id"] == environment["id"]
    assert service["status"] == "inactive"

    assert client.get("/api/v1/projects", headers=auth_headers).json() == [project]
    assert client.get(
        "/api/v1/environments",
        headers=auth_headers,
        params={"project_id": project["id"]},
    ).json() == [environment]
    assert client.get(
        "/api/v1/services",
        headers=auth_headers,
        params={"project_id": project["id"], "environment_id": environment["id"]},
    ).json() == [service]


def test_project_creator_gets_admin_permission() -> None:
    client = build_client()
    user, auth_headers = create_auth_headers(client)

    project = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        role = SqlAlchemyPermissionRepository(session).get_user_project_role(
            user_id=user.id,
            project_id=project["id"],
        )

    assert role == ProjectRole.admin


def test_project_create_rolls_back_when_creator_admin_grant_fails() -> None:
    client = build_client()
    user = create_test_user(client)
    app = _tested_app(client)

    class FailingPermissionRepository(SqlAlchemyPermissionRepository):
        def add_project_member(
            self,
            *,
            project_id: int,
            user_id: int,
            role: ProjectRole,
        ) -> ProjectMemberRecord:
            raise ResourceIntegrityError("项目权限完整性约束错误")

    with app.state.db_session_factory() as session:
        management_repository = SqlAlchemyManagementRepository(session)
        management_service = ManagementService(
            management_repository,
            PermissionService(FailingPermissionRepository(session)),
        )

        with pytest.raises(ResourceIntegrityError, match="项目权限完整性约束错误"):
            management_service.create_project(
                payload=ProjectCreate(name="核心平台", key="core-platform"),
                user=user,
            )

        assert management_repository.list_projects() == []


def test_mysql_project_create_transaction_rolls_back_failed_admin_grant(
    mysql_client: TestClient,
) -> None:
    user = create_test_user(mysql_client, username="mysql-rollback-user")
    app = _tested_app(mysql_client)

    class InvalidUserPermissionRepository(SqlAlchemyPermissionRepository):
        def add_project_member(
            self,
            *,
            project_id: int,
            user_id: int,
            role: ProjectRole,
        ) -> ProjectMemberRecord:
            return super().add_project_member(
                project_id=project_id,
                user_id=-987654321,
                role=role,
            )

    with app.state.db_session_factory() as session:
        management_service = ManagementService(
            SqlAlchemyManagementRepository(session),
            PermissionService(InvalidUserPermissionRepository(session)),
        )

        with pytest.raises(ResourceIntegrityError, match="项目权限完整性约束错误"):
            management_service.create_project(
                payload=ProjectCreate(name="MySQL 回滚项目", key="mysql-rollback"),
                user=user,
            )

    with app.state.db_session_factory() as session:
        management_repository = SqlAlchemyManagementRepository(session)
        permission_repository = SqlAlchemyPermissionRepository(session)

        assert management_repository.list_projects() == []
        assert (
            permission_repository.get_user_project_role(
                user_id=user.id,
                project_id=1,
            )
            is None
        )

    normal_user, auth_headers = create_auth_headers(mysql_client, username="mysql-admin-user")
    project_response = mysql_client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "MySQL 正常项目", "key": "mysql-normal"},
    )

    assert project_response.status_code == 201
    with app.state.db_session_factory() as session:
        role = SqlAlchemyPermissionRepository(session).get_user_project_role(
            user_id=normal_user.id,
            project_id=project_response.json()["id"],
        )

    assert role == ProjectRole.admin


def test_user_cannot_read_other_users_project() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    _, stranger_headers = create_auth_headers(client, username="stranger")
    project = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()

    list_response = client.get("/api/v1/projects", headers=stranger_headers)
    scoped_environment_response = client.get(
        "/api/v1/environments",
        headers=stranger_headers,
        params={"project_id": project["id"]},
    )

    assert list_response.status_code == 200
    assert list_response.json() == []
    assert scoped_environment_response.status_code == 403
    assert scoped_environment_response.json()["detail"] == "无项目权限"


def test_viewer_can_read_but_cannot_create_environment_or_service() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    viewer, viewer_headers = create_auth_headers(client, username="viewer")
    project = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    environment = client.post(
        "/api/v1/environments",
        headers=owner_headers,
        json={"project_id": project["id"], "name": "生产环境", "key": "prod"},
    ).json()
    grant_project_role(
        client,
        project_id=project["id"],
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )

    assert client.get("/api/v1/projects", headers=viewer_headers).json() == [project]
    assert client.get(
        "/api/v1/environments",
        headers=viewer_headers,
        params={"project_id": project["id"]},
    ).json() == [environment]

    environment_response = client.post(
        "/api/v1/environments",
        headers=viewer_headers,
        json={"project_id": project["id"], "name": "测试环境", "key": "test"},
    )
    service_response = client.post(
        "/api/v1/services",
        headers=viewer_headers,
        json={
            "project_id": project["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
        },
    )

    assert environment_response.status_code == 403
    assert service_response.status_code == 403


def test_editor_can_create_environment_and_service() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    editor, editor_headers = create_auth_headers(client, username="editor")
    project = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    grant_project_role(
        client,
        project_id=project["id"],
        user_id=editor.id,
        role=ProjectRole.editor,
    )

    environment_response = client.post(
        "/api/v1/environments",
        headers=editor_headers,
        json={"project_id": project["id"], "name": "生产环境", "key": "prod"},
    )
    environment = environment_response.json()
    service_response = client.post(
        "/api/v1/services",
        headers=editor_headers,
        json={
            "project_id": project["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
        },
    )

    assert environment_response.status_code == 201
    assert service_response.status_code == 201


def test_superuser_can_manage_all_projects_without_membership() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    _, superuser_headers = create_auth_headers(client, username="root", is_superuser=True)
    project = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()

    environment_response = client.post(
        "/api/v1/environments",
        headers=superuser_headers,
        json={"project_id": project["id"], "name": "生产环境", "key": "prod"},
    )
    environment = environment_response.json()
    service_response = client.post(
        "/api/v1/services",
        headers=superuser_headers,
        json={
            "project_id": project["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
        },
    )

    assert client.get("/api/v1/projects", headers=superuser_headers).json() == [project]
    assert environment_response.status_code == 201
    assert service_response.status_code == 201


def test_project_create_rejects_invalid_payload() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)

    response = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={
            "name": " ",
            "key": "Invalid Key",
        },
    )

    assert response.status_code == 422


def test_duplicate_project_key_returns_conflict() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)
    payload = {"name": "核心平台", "key": "core-platform"}

    assert client.post("/api/v1/projects", headers=auth_headers, json=payload).status_code == 201
    response = client.post("/api/v1/projects", headers=auth_headers, json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "项目 key 已存在"


def test_environment_requires_existing_project() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)

    response = client.post(
        "/api/v1/environments",
        headers=auth_headers,
        json={"project_id": 999, "name": "生产环境", "key": "prod"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "项目不存在"


def test_duplicate_environment_key_returns_conflict() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)
    project = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    payload = {"project_id": project["id"], "name": "生产环境", "key": "prod"}

    assert (
        client.post("/api/v1/environments", headers=auth_headers, json=payload).status_code == 201
    )
    response = client.post("/api/v1/environments", headers=auth_headers, json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "同一项目下环境 key 已存在"


def test_service_project_must_match_environment_project() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)
    project_a = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "项目 A", "key": "project-a"},
    ).json()
    project_b = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "项目 B", "key": "project-b"},
    ).json()
    environment = client.post(
        "/api/v1/environments",
        headers=auth_headers,
        json={"project_id": project_a["id"], "name": "生产环境", "key": "prod"},
    ).json()

    response = client.post(
        "/api/v1/services",
        headers=auth_headers,
        json={
            "project_id": project_b["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "服务 project_id 必须与环境所属项目一致"


def test_service_create_hides_environment_in_other_unauthorized_project() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    editor, editor_headers = create_auth_headers(client, username="editor")
    project_a = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "项目 A", "key": "project-a"},
    ).json()
    project_b = client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "项目 B", "key": "project-b"},
    ).json()
    environment_a = client.post(
        "/api/v1/environments",
        headers=owner_headers,
        json={"project_id": project_a["id"], "name": "生产环境", "key": "prod"},
    ).json()
    grant_project_role(
        client,
        project_id=project_b["id"],
        user_id=editor.id,
        role=ProjectRole.editor,
    )
    payload = {
        "project_id": project_b["id"],
        "environment_id": environment_a["id"],
        "name": "API 服务",
        "key": "api-service",
    }
    missing_environment_payload = {
        **payload,
        "environment_id": environment_a["id"] + 999,
        "key": "api-service-missing",
    }

    response = client.post("/api/v1/services", headers=editor_headers, json=payload)
    missing_response = client.post(
        "/api/v1/services",
        headers=editor_headers,
        json=missing_environment_payload,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "环境不存在"
    assert missing_response.status_code == response.status_code
    assert missing_response.json()["detail"] == response.json()["detail"]
    assert (
        client.get(
            "/api/v1/services",
            headers=editor_headers,
            params={"project_id": project_b["id"]},
        ).json()
        == []
    )


def test_mysql_service_create_hides_cross_project_environment_and_creates_no_service(
    mysql_client: TestClient,
) -> None:
    _, owner_headers = create_auth_headers(mysql_client, username="mysql-owner")
    editor, editor_headers = create_auth_headers(mysql_client, username="mysql-editor")
    project_a = mysql_client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "MySQL 项目 A", "key": "mysql-project-a"},
    ).json()
    project_b = mysql_client.post(
        "/api/v1/projects",
        headers=owner_headers,
        json={"name": "MySQL 项目 B", "key": "mysql-project-b"},
    ).json()
    environment_a = mysql_client.post(
        "/api/v1/environments",
        headers=owner_headers,
        json={"project_id": project_a["id"], "name": "MySQL 生产环境", "key": "mysql-prod"},
    ).json()
    grant_project_role(
        mysql_client,
        project_id=project_b["id"],
        user_id=editor.id,
        role=ProjectRole.editor,
    )
    cross_project_payload = {
        "project_id": project_b["id"],
        "environment_id": environment_a["id"],
        "name": "MySQL API 服务",
        "key": "mysql-api-service",
    }
    missing_environment_payload = {
        **cross_project_payload,
        "environment_id": environment_a["id"] + 999,
        "key": "mysql-api-service-missing",
    }

    response = mysql_client.post(
        "/api/v1/services",
        headers=editor_headers,
        json=cross_project_payload,
    )
    missing_response = mysql_client.post(
        "/api/v1/services",
        headers=editor_headers,
        json=missing_environment_payload,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "环境不存在"
    assert missing_response.status_code == response.status_code
    assert missing_response.json()["detail"] == response.json()["detail"]
    assert (
        mysql_client.get(
            "/api/v1/services",
            headers=editor_headers,
            params={"project_id": project_b["id"]},
        ).json()
        == []
    )


def test_duplicate_service_key_returns_conflict() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client)
    project = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    environment = client.post(
        "/api/v1/environments",
        headers=auth_headers,
        json={"project_id": project["id"], "name": "生产环境", "key": "prod"},
    ).json()
    payload = {
        "project_id": project["id"],
        "environment_id": environment["id"],
        "name": "API 服务",
        "key": "api-service",
    }

    assert client.post("/api/v1/services", headers=auth_headers, json=payload).status_code == 201
    response = client.post("/api/v1/services", headers=auth_headers, json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "同一环境下服务 key 已存在"


def test_sqlalchemy_repository_enforces_scoped_environment_key() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyManagementRepository(session)
        project = repository.create_project(
            name="核心平台",
            key="core-platform",
            description=None,
            status=ResourceStatus.active,
        )
        repository.create_environment(
            project_id=project.id,
            name="生产环境",
            key="prod",
            description=None,
            status=ResourceStatus.active,
        )

        try:
            repository.create_environment(
                project_id=project.id,
                name="生产环境副本",
                key="prod",
                description=None,
                status=ResourceStatus.active,
            )
        except DuplicateResourceError as error:
            assert str(error) == "同一项目下环境 key 已存在"
        else:
            raise AssertionError("重复环境 key 应触发 DuplicateResourceError")


def test_sqlalchemy_repository_maps_environment_foreign_key_to_not_found() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyManagementRepository(session)

        try:
            repository.create_environment(
                project_id=999,
                name="生产环境",
                key="prod",
                description=None,
                status=ResourceStatus.active,
            )
        except ResourceNotFoundError as error:
            assert str(error) == "项目不存在"
        else:
            raise AssertionError("缺失项目外键应触发 ResourceNotFoundError")


def test_sqlalchemy_repository_enforces_scoped_service_key() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyManagementRepository(session)
        project = repository.create_project(
            name="核心平台",
            key="core-platform",
            description=None,
            status=ResourceStatus.active,
        )
        environment = repository.create_environment(
            project_id=project.id,
            name="生产环境",
            key="prod",
            description=None,
            status=ResourceStatus.active,
        )
        repository.create_service(
            project_id=project.id,
            environment_id=environment.id,
            name="API 服务",
            key="api-service",
            description=None,
            status=ResourceStatus.active,
        )

        try:
            repository.create_service(
                project_id=project.id,
                environment_id=environment.id,
                name="API 服务副本",
                key="api-service",
                description=None,
                status=ResourceStatus.active,
            )
        except DuplicateResourceError as error:
            assert str(error) == "同一环境下服务 key 已存在"
        else:
            raise AssertionError("重复服务 key 应触发 DuplicateResourceError")


def test_sqlalchemy_repository_rejects_service_project_environment_mismatch() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyManagementRepository(session)
        project_a = repository.create_project(
            name="项目 A",
            key="project-a",
            description=None,
            status=ResourceStatus.active,
        )
        project_b = repository.create_project(
            name="项目 B",
            key="project-b",
            description=None,
            status=ResourceStatus.active,
        )
        environment = repository.create_environment(
            project_id=project_a.id,
            name="生产环境",
            key="prod",
            description=None,
            status=ResourceStatus.active,
        )

        try:
            repository.create_service(
                project_id=project_b.id,
                environment_id=environment.id,
                name="API 服务",
                key="api-service",
                description=None,
                status=ResourceStatus.active,
            )
        except ResourceConflictError as error:
            assert str(error) == "服务 project_id 必须与环境所属项目一致"
        else:
            raise AssertionError("服务 project_id 与环境所属项目不一致应触发 ResourceConflictError")

        assert repository.list_services() == []


def test_sqlalchemy_repository_unknown_integrity_error_is_not_duplicate() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        repository = SqlAlchemyManagementRepository(session)

        def raise_unknown_integrity_error() -> None:
            raise IntegrityError("INSERT", {}, Exception("opaque backend integrity error"))

        session.commit = raise_unknown_integrity_error

        try:
            repository.create_environment(
                project_id=1,
                name="生产环境",
                key="prod",
                description=None,
                status=ResourceStatus.active,
            )
        except ResourceIntegrityError as error:
            assert str(error) == "管理资源完整性约束错误"
        except DuplicateResourceError as error:
            raise AssertionError("未知完整性错误不应触发 DuplicateResourceError") from error
        else:
            raise AssertionError("未知完整性错误应触发 ResourceIntegrityError")

        try:
            repository.create_service(
                project_id=1,
                environment_id=1,
                name="API 服务",
                key="api-service",
                description=None,
                status=ResourceStatus.active,
            )
        except ResourceIntegrityError as error:
            assert str(error) == "管理资源完整性约束错误"
        except DuplicateResourceError as error:
            raise AssertionError("未知完整性错误不应触发 DuplicateResourceError") from error
        else:
            raise AssertionError("未知完整性错误应触发 ResourceIntegrityError")
