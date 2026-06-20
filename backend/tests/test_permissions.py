from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.repositories.auth import SqlAlchemyAuthRepository
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.schemas.management import ResourceStatus
from app.schemas.permissions import ProjectRole
from app.services.auth import hash_password
from app.services.errors import ResourceForbiddenError
from app.services.permissions import PermissionService

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"


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


def test_permission_service_applies_project_role_hierarchy_and_superuser_bypass() -> None:
    client = build_client()
    app = _tested_app(client)

    with app.state.db_session_factory() as session:
        auth_repository = SqlAlchemyAuthRepository(session)
        management_repository = SqlAlchemyManagementRepository(session)
        permission_repository = SqlAlchemyPermissionRepository(session)
        permission_service = PermissionService(permission_repository)

        viewer = auth_repository.create_user(
            username="viewer",
            email="viewer@example.test",
            password_hash=hash_password("correct-password"),
            display_name="只读用户",
        )
        superuser = auth_repository.create_user(
            username="root",
            email="root@example.test",
            password_hash=hash_password("correct-password"),
            display_name="超级用户",
            is_superuser=True,
        )
        project = management_repository.create_project(
            name="核心平台",
            key="core-platform",
            description=None,
            status=ResourceStatus.active,
        )
        permission_repository.add_project_member(
            project_id=project.id,
            user_id=viewer.id,
            role=ProjectRole.viewer,
        )

        assert permission_service.has_project_role(
            user=viewer,
            project_id=project.id,
            minimum_role=ProjectRole.viewer,
        )
        assert not permission_service.has_project_role(
            user=viewer,
            project_id=project.id,
            minimum_role=ProjectRole.editor,
        )
        assert permission_service.has_project_role(
            user=superuser,
            project_id=project.id,
            minimum_role=ProjectRole.admin,
        )

        try:
            permission_service.ensure_project_role(
                user=viewer,
                project_id=project.id,
                minimum_role=ProjectRole.editor,
            )
        except ResourceForbiddenError as error:
            assert str(error) == "无项目权限"
        else:
            raise AssertionError("viewer 不应满足 editor 权限")
