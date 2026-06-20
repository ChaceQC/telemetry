from datetime import datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.repositories.management import SqlAlchemyManagementRepository
from app.schemas.management import ResourceStatus
from app.services.errors import (
    DuplicateResourceError,
    ResourceConflictError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)


def build_client() -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.db_engine)
    return TestClient(app)


def _tested_app(client: TestClient) -> FastAPI:
    return cast(FastAPI, client.app)


def test_create_and_list_management_resources() -> None:
    client = build_client()

    project_response = client.post(
        "/api/v1/projects",
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

    assert client.get("/api/v1/projects").json() == [project]
    assert client.get("/api/v1/environments", params={"project_id": project["id"]}).json() == [
        environment
    ]
    assert client.get(
        "/api/v1/services",
        params={"project_id": project["id"], "environment_id": environment["id"]},
    ).json() == [service]


def test_project_create_rejects_invalid_payload() -> None:
    client = build_client()

    response = client.post(
        "/api/v1/projects",
        json={
            "name": " ",
            "key": "Invalid Key",
        },
    )

    assert response.status_code == 422


def test_duplicate_project_key_returns_conflict() -> None:
    client = build_client()
    payload = {"name": "核心平台", "key": "core-platform"}

    assert client.post("/api/v1/projects", json=payload).status_code == 201
    response = client.post("/api/v1/projects", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "项目 key 已存在"


def test_environment_requires_existing_project() -> None:
    client = build_client()

    response = client.post(
        "/api/v1/environments",
        json={"project_id": 999, "name": "生产环境", "key": "prod"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "项目不存在"


def test_duplicate_environment_key_returns_conflict() -> None:
    client = build_client()
    project = client.post(
        "/api/v1/projects",
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    payload = {"project_id": project["id"], "name": "生产环境", "key": "prod"}

    assert client.post("/api/v1/environments", json=payload).status_code == 201
    response = client.post("/api/v1/environments", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "同一项目下环境 key 已存在"


def test_service_project_must_match_environment_project() -> None:
    client = build_client()
    project_a = client.post(
        "/api/v1/projects",
        json={"name": "项目 A", "key": "project-a"},
    ).json()
    project_b = client.post(
        "/api/v1/projects",
        json={"name": "项目 B", "key": "project-b"},
    ).json()
    environment = client.post(
        "/api/v1/environments",
        json={"project_id": project_a["id"], "name": "生产环境", "key": "prod"},
    ).json()

    response = client.post(
        "/api/v1/services",
        json={
            "project_id": project_b["id"],
            "environment_id": environment["id"],
            "name": "API 服务",
            "key": "api-service",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "服务 project_id 必须与环境所属项目一致"


def test_duplicate_service_key_returns_conflict() -> None:
    client = build_client()
    project = client.post(
        "/api/v1/projects",
        json={"name": "核心平台", "key": "core-platform"},
    ).json()
    environment = client.post(
        "/api/v1/environments",
        json={"project_id": project["id"], "name": "生产环境", "key": "prod"},
    ).json()
    payload = {
        "project_id": project["id"],
        "environment_id": environment["id"],
        "name": "API 服务",
        "key": "api-service",
    }

    assert client.post("/api/v1/services", json=payload).status_code == 201
    response = client.post("/api/v1/services", json=payload)

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
