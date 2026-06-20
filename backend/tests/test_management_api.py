from datetime import datetime

from fastapi.testclient import TestClient

from app.core.application import create_app
from app.core.config import Settings


def build_client() -> TestClient:
    settings = Settings(app_name="telemetry-backend-test", app_version="0.1.0")
    return TestClient(create_app(settings))


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
