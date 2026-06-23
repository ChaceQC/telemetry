import json
from argparse import Namespace
from pathlib import Path
from typing import Any, cast

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateTable, Table

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.dashboard import DashboardModel
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.dashboard import SqlAlchemyDashboardRepository
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.schemas.dashboard import (
    MAX_DASHBOARD_JSON_BYTES,
    MAX_DASHBOARD_JSON_DEPTH,
    MAX_DASHBOARD_JSON_NODES,
)
from app.schemas.management import ResourceStatus
from app.schemas.permissions import ProjectRole
from app.services.auth import AuthService, hash_password
from app.services.errors import ResourceNotFoundError

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


def create_project(
    client: TestClient,
    auth_headers: dict[str, str],
    *,
    name: str = "核心平台",
    key: str = "core-platform",
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": name, "key": key},
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


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


def create_dashboard(
    client: TestClient,
    auth_headers: dict[str, str],
    *,
    project_id: int,
    name: str = "服务总览",
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": name,
            "description": "面向值班的最小总览",
            "layout": {"version": 1, "widgets": []},
            "config": {"refresh_seconds": 30},
        },
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def _json_request_headers(auth_headers: dict[str, str]) -> dict[str, str]:
    return {**auth_headers, "Content-Type": "application/json"}


def _dashboard_content(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, allow_nan=True)


def _too_deep_dashboard_json() -> Any:
    value: Any = []
    for _ in range(MAX_DASHBOARD_JSON_DEPTH):
        value = [value]
    return value


def _too_complex_dashboard_json() -> dict[str, Any]:
    return {"items": [0] * MAX_DASHBOARD_JSON_NODES}


def _dashboard_panel_config() -> dict[str, Any]:
    return {
        "refresh_seconds": 30,
        "panels": [
            {
                "id": "latency-p95",
                "title": "P95 latency",
                "type": "metrics",
                "query": {
                    "name": "http.server.duration",
                    "aggregation": "max",
                    "window": "5m",
                },
                "layout": {"x": 0, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "error-logs",
                "title": "Error logs",
                "type": "logs",
                "query": {"level": "error"},
            },
        ],
    }


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("GET", "/api/v1/dashboards", None),
        ("POST", "/api/v1/dashboards", {"project_id": 1, "name": "服务总览"}),
        ("GET", "/api/v1/projects/1/dashboards/1", None),
        ("PATCH", "/api/v1/projects/1/dashboards/1", {"name": "服务概览"}),
        ("DELETE", "/api/v1/projects/1/dashboards/1", None),
    ],
)
def test_dashboard_api_rejects_missing_token(
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    client = build_client()

    response = client.request(method, path, json=json_body)

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"
    assert response.headers["www-authenticate"] == "Bearer"


def test_dashboard_crud_success_path_with_pagination_and_audit_fields() -> None:
    client = build_client()
    owner, owner_headers = create_auth_headers(client, username="owner")
    editor, editor_headers = create_auth_headers(client, username="editor")
    project = create_project(client, owner_headers)
    project_id = cast(int, project["id"])
    grant_project_role(
        client,
        project_id=project_id,
        user_id=editor.id,
        role=ProjectRole.editor,
    )

    created = create_dashboard(client, owner_headers, project_id=project_id)
    create_dashboard(client, owner_headers, project_id=project_id, name="错误预算")
    create_dashboard(client, owner_headers, project_id=project_id, name="日志排障")

    assert created["id"] == 1
    assert created["project_id"] == project_id
    assert created["name"] == "服务总览"
    assert created["layout"] == {"version": 1, "widgets": []}
    assert created["config"] == {"refresh_seconds": 30}
    assert created["created_by_user_id"] == owner.id
    assert created["updated_by_user_id"] == owner.id
    assert created["created_at"]
    assert created["updated_at"]

    list_response = client.get(
        "/api/v1/dashboards",
        headers=owner_headers,
        params={"project_id": project_id, "limit": 2, "offset": 1},
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 3
    assert listed["limit"] == 2
    assert listed["offset"] == 1
    assert len(listed["items"]) == 2

    get_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{created['id']}",
        headers=owner_headers,
    )
    assert get_response.status_code == 200
    assert get_response.json() == created

    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{created['id']}",
        headers=editor_headers,
        json={
            "name": "服务健康概览",
            "description": None,
            "layout": [{"x": 0, "y": 0, "w": 6, "h": 4}],
            "config": {"refresh_seconds": 60, "theme": "system"},
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "服务健康概览"
    assert updated["description"] is None
    assert updated["layout"] == [{"x": 0, "y": 0, "w": 6, "h": 4}]
    assert updated["config"] == {"refresh_seconds": 60, "theme": "system"}
    assert updated["created_by_user_id"] == owner.id
    assert updated["updated_by_user_id"] == editor.id

    delete_response = client.delete(
        f"/api/v1/projects/{project_id}/dashboards/{created['id']}",
        headers=editor_headers,
    )
    assert delete_response.status_code == 204
    assert delete_response.content == b""

    missing_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{created['id']}",
        headers=owner_headers,
    )
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "仪表盘不存在"


def test_dashboard_permissions_hide_unscoped_projects_and_cross_project_ids() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    viewer, viewer_headers = create_auth_headers(client, username="viewer")
    editor, editor_headers = create_auth_headers(client, username="editor")
    _, stranger_headers = create_auth_headers(client, username="stranger")
    project_a = create_project(client, owner_headers, name="项目 A", key="project-a")
    project_b = create_project(client, owner_headers, name="项目 B", key="project-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    dashboard_a = create_dashboard(client, owner_headers, project_id=project_a_id)
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    grant_project_role(
        client,
        project_id=project_b_id,
        user_id=editor.id,
        role=ProjectRole.editor,
    )

    viewer_list_response = client.get(
        "/api/v1/dashboards",
        headers=viewer_headers,
        params={"project_id": project_a_id},
    )
    viewer_create_response = client.post(
        "/api/v1/dashboards",
        headers=viewer_headers,
        json={"project_id": project_a_id, "name": "只读用户不应创建"},
    )
    viewer_update_response = client.patch(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard_a['id']}",
        headers=viewer_headers,
        json={"name": "只读用户不应更新"},
    )
    viewer_delete_response = client.delete(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard_a['id']}",
        headers=viewer_headers,
    )

    stranger_global_list_response = client.get("/api/v1/dashboards", headers=stranger_headers)
    stranger_scoped_list_response = client.get(
        "/api/v1/dashboards",
        headers=stranger_headers,
        params={"project_id": project_a_id},
    )
    stranger_get_response = client.get(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard_a['id']}",
        headers=stranger_headers,
    )
    cross_project_get_response = client.get(
        f"/api/v1/projects/{project_b_id}/dashboards/{dashboard_a['id']}",
        headers=editor_headers,
    )

    assert viewer_list_response.status_code == 200
    assert viewer_list_response.json()["items"] == [dashboard_a]
    assert viewer_create_response.status_code == 403
    assert viewer_update_response.status_code == 403
    assert viewer_delete_response.status_code == 403
    assert stranger_global_list_response.status_code == 200
    assert stranger_global_list_response.json()["items"] == []
    assert stranger_global_list_response.json()["total"] == 0
    assert stranger_scoped_list_response.status_code == 404
    assert stranger_scoped_list_response.json()["detail"] == "项目不存在"
    assert stranger_get_response.status_code == 404
    assert stranger_get_response.json()["detail"] == "项目不存在"
    assert cross_project_get_response.status_code == 404
    assert cross_project_get_response.json()["detail"] == "仪表盘不存在"


def test_superuser_can_manage_dashboards_without_project_membership() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    _, superuser_headers = create_auth_headers(client, username="root", is_superuser=True)
    project = create_project(client, owner_headers)
    project_id = cast(int, project["id"])

    response = client.post(
        "/api/v1/dashboards",
        headers=superuser_headers,
        json={"project_id": project_id, "name": "超级用户总览"},
    )

    assert response.status_code == 201
    assert response.json()["project_id"] == project_id
    assert response.json()["layout"] == {}
    assert response.json()["config"] == {}


def test_dashboard_create_and_update_accept_panel_config() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="panel-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    config = _dashboard_panel_config()

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Panel dashboard",
            "config": config,
        },
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["config"] == config

    updated_config = {
        "refresh_seconds": 60,
        "panels": [
            {
                "id": "trace-map",
                "title": "Trace map",
                "type": "topology",
                "query": {"source": "checkout"},
                "layout": {"x": 6.5, "y": 0, "w": 5.5, "h": 4},
            }
        ],
    }
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"config": updated_config},
    )

    assert update_response.status_code == 200
    assert update_response.json()["config"] == updated_config


def test_dashboard_panel_config_normalizes_string_fields_for_create_and_update() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="normalized-panel-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])

    create_config = {
        "panels": [
            {
                "id": " latency-p95 ",
                "title": " P95 latency ",
                "type": " metrics ",
                "query": {"name": "http.server.duration"},
            }
        ]
    }
    expected_create_config = {
        "panels": [
            {
                "id": "latency-p95",
                "title": "P95 latency",
                "type": "metrics",
                "query": {"name": "http.server.duration"},
            }
        ]
    }
    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Normalized panel dashboard",
            "config": create_config,
        },
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["config"] == expected_create_config
    assert dashboard["config"]["panels"][0]["type"] == "metrics"

    update_config = {
        "panels": [
            {
                "id": "\terror-logs\n",
                "title": "\tError logs\n",
                "type": "\tlogs\n",
                "query": {"level": "error"},
            }
        ]
    }
    expected_update_config = {
        "panels": [
            {
                "id": "error-logs",
                "title": "Error logs",
                "type": "logs",
                "query": {"level": "error"},
            }
        ]
    }
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"config": update_config},
    )

    assert update_response.status_code == 200
    assert update_response.json()["config"] == expected_update_config
    assert update_response.json()["config"]["panels"][0]["type"] == "logs"


def test_dashboard_panel_config_keeps_legacy_config_compatible() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="legacy-config-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])

    legacy_config_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Legacy config",
            "config": {"refresh_seconds": 30},
        },
    )
    arbitrary_config_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Arbitrary config",
            "config": [{"query": "legacy raw query"}],
        },
    )

    assert legacy_config_response.status_code == 201
    assert legacy_config_response.json()["config"] == {"refresh_seconds": 30}
    assert arbitrary_config_response.status_code == 201
    assert arbitrary_config_response.json()["config"] == [{"query": "legacy raw query"}]


def test_dashboard_validation_errors_are_reported_as_422() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)

    invalid_create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={"project_id": project_id, "name": " ", "layout": "not-json-container"},
    )
    empty_patch_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={},
    )
    null_layout_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"layout": None},
    )
    invalid_limit_response = client.get(
        "/api/v1/dashboards",
        headers=auth_headers,
        params={"limit": 101},
    )

    assert invalid_create_response.status_code == 422
    assert empty_patch_response.status_code == 422
    assert null_layout_response.status_code == 422
    assert invalid_limit_response.status_code == 422


@pytest.mark.parametrize(
    "invalid_config",
    [
        {"panels": "not-array"},
        {"panels": ["not-object"]},
        {"panels": [{"id": "cpu", "title": "CPU", "type": "chart", "query": {}}]},
        {"panels": [{"title": "CPU", "type": "metrics", "query": {}}]},
        {"panels": [{"id": "cpu", "type": "metrics", "query": {}}]},
        {"panels": [{"id": "cpu", "title": "CPU", "query": {}}]},
        {"panels": [{"id": "cpu", "title": "CPU", "type": "metrics"}]},
        {"panels": [{"id": "cpu", "title": "CPU", "type": "metrics", "query": "name=cpu"}]},
        {
            "panels": [
                {"id": "cpu", "title": "CPU", "type": "metrics", "query": {}},
                {"id": "cpu", "title": "CPU duplicate", "type": "logs", "query": {}},
            ]
        },
        {
            "panels": [
                {"id": " cpu ", "title": "CPU", "type": "metrics", "query": {}},
                {"id": "cpu", "title": "CPU duplicate", "type": "logs", "query": {}},
            ]
        },
        {
            "panels": [
                {
                    "id": "cpu",
                    "title": "CPU",
                    "type": "metrics",
                    "query": {},
                    "layout": {"x": -1, "y": 0, "w": 6, "h": 4},
                }
            ]
        },
        {
            "panels": [
                {
                    "id": "cpu",
                    "title": "CPU",
                    "type": "metrics",
                    "query": {},
                    "layout": {"x": 0, "y": 0, "w": 0, "h": 4},
                }
            ]
        },
        {
            "panels": [
                {
                    "id": "cpu",
                    "title": "CPU",
                    "type": "metrics",
                    "query": {},
                    "layout": {"x": 0, "y": 0, "w": 6},
                }
            ]
        },
    ],
)
def test_dashboard_invalid_panel_config_is_reported_as_422(
    invalid_config: dict[str, Any],
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="invalid-panel-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid panel config",
            "config": invalid_config,
        },
    )
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"config": invalid_config},
    )

    assert create_response.status_code == 422
    assert any("config" in error["loc"] for error in create_response.json()["detail"])
    assert update_response.status_code == 422
    assert any("config" in error["loc"] for error in update_response.json()["detail"])


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("layout", {"blob": "x" * (MAX_DASHBOARD_JSON_BYTES + 1)}),
        ("config", _too_deep_dashboard_json()),
        ("layout", _too_complex_dashboard_json()),
        ("layout", {"bad": float("nan")}),
        ("config", {"bad": [float("inf")]}),
        ("config", {"bad": float("-inf")}),
    ],
)
def test_dashboard_json_payload_limits_are_reported_as_422_for_create_and_update(
    field_name: str,
    invalid_value: Any,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username=f"owner-{field_name}")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)
    headers = _json_request_headers(auth_headers)

    create_body = {
        "project_id": project_id,
        "name": f"非法 {field_name}",
        field_name: invalid_value,
    }
    create_response = client.post(
        "/api/v1/dashboards",
        headers=headers,
        content=_dashboard_content(create_body),
    )
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=headers,
        content=_dashboard_content({field_name: invalid_value}),
    )

    assert create_response.status_code == 422
    assert any(field_name in error["loc"] for error in create_response.json()["detail"])
    assert update_response.status_code == 422
    assert any(field_name in error["loc"] for error in update_response.json()["detail"])


def test_dashboard_update_omits_json_fields_and_accepts_empty_structures() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="partial-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)

    name_only_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"name": "仅改名称"},
    )
    empty_json_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"layout": [], "config": {}},
    )

    assert name_only_response.status_code == 200
    assert name_only_response.json()["layout"] == dashboard["layout"]
    assert name_only_response.json()["config"] == dashboard["config"]
    assert empty_json_response.status_code == 200
    assert empty_json_response.json()["layout"] == []
    assert empty_json_response.json()["config"] == {}


def test_dashboard_repository_maps_missing_project_to_not_found() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        user = SqlAlchemyAuthRepository(session).create_user(
            username="owner",
            email="owner@example.test",
            password_hash=hash_password("correct-password"),
            display_name="owner",
        )
        repository = SqlAlchemyDashboardRepository(session)

        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            repository.create_dashboard(
                project_id=999,
                name="孤立仪表盘",
                description=None,
                layout={},
                config={},
                created_by_user_id=user.id,
            )


def test_dashboard_repository_persists_json_and_deletes_record() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        auth_repository = SqlAlchemyAuthRepository(session)
        owner = auth_repository.create_user(
            username="owner",
            email="owner@example.test",
            password_hash=hash_password("correct-password"),
            display_name="owner",
        )
        project = SqlAlchemyManagementRepository(session).create_project(
            name="核心平台",
            key="core-platform",
            description=None,
            status=ResourceStatus.active,
        )
        repository = SqlAlchemyDashboardRepository(session)
        dashboard = repository.create_dashboard(
            project_id=project.id,
            name="服务总览",
            description=None,
            layout=[{"i": "latency"}],
            config={"refresh_seconds": 30},
            created_by_user_id=owner.id,
        )

        assert dashboard.layout == [{"i": "latency"}]
        assert dashboard.config == {"refresh_seconds": 30}
        assert repository.delete_dashboard(dashboard.id)
        assert repository.get_dashboard(dashboard.id) is None


def test_dashboard_migration_sqlite_upgrade_and_downgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "dashboard-migration.db"
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
        inspector = inspect(app.state.db_engine)
        assert "dashboards" in inspector.get_table_names()
        columns = {column["name"] for column in inspector.get_columns("dashboards")}
        assert {
            "id",
            "project_id",
            "name",
            "description",
            "layout",
            "config",
            "created_by_user_id",
            "updated_by_user_id",
            "created_at",
            "updated_at",
        } <= columns
        indexes = {index["name"] for index in inspector.get_indexes("dashboards")}
        assert "ix_dashboards_project_updated_at_id" in indexes
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
        assert "dashboards" not in inspect(app.state.db_engine).get_table_names()
    finally:
        app.state.db_engine.dispose()


def test_dashboard_model_mysql_ddl_uses_json_columns_and_utf8mb4() -> None:
    table = cast(Table, DashboardModel.__table__)
    compiled = str(CreateTable(table).compile(dialect=mysql.dialect()))

    assert "CREATE TABLE dashboards" in compiled
    assert "layout JSON NOT NULL" in compiled
    assert "config JSON NOT NULL" in compiled
    assert "CHARSET=utf8mb4" in compiled
