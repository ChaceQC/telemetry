import json
from argparse import Namespace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
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
    DASHBOARD_EXPORT_SCHEMA,
    DASHBOARD_EXPORT_VERSION,
    MAX_DASHBOARD_JSON_BYTES,
    MAX_DASHBOARD_JSON_DEPTH,
    MAX_DASHBOARD_JSON_NODES,
    DashboardCreate,
)
from app.schemas.management import ResourceStatus
from app.schemas.permissions import ProjectRole
from app.services.auth import AuthService, hash_password
from app.services.dashboard_templates import get_builtin_dashboard_template
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


def create_api_key(
    client: TestClient,
    auth_headers: dict[str, str],
    *,
    project_id: int,
) -> str:
    response = client.post(
        f"/api/v1/projects/{project_id}/api-keys",
        headers=auth_headers,
        json={"name": "dashboard-panel-preview"},
    )
    assert response.status_code == 201
    return str(response.json()["api_key"])


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


def _dashboard_variable_config() -> dict[str, Any]:
    return {
        "refresh_seconds": 30,
        "variables": [
            {
                "name": "env",
                "label": "Environment",
                "type": "select",
                "default": "prod",
                "options": ["prod", "staging"],
            },
            {
                "name": "service_name",
                "label": "Service",
                "type": "text",
                "default": "checkout",
            },
            {
                "name": "_sample_rate",
                "label": "Sample rate",
                "type": "number",
                "default": 0.5,
            },
        ],
    }


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("GET", "/api/v1/dashboard-templates", None),
        ("GET", "/api/v1/dashboard-templates/service-overview", None),
        ("POST", "/api/v1/projects/1/dashboard-templates/service-overview/dashboards", {}),
        ("GET", "/api/v1/dashboards", None),
        ("POST", "/api/v1/dashboards", {"project_id": 1, "name": "服务总览"}),
        (
            "POST",
            "/api/v1/projects/1/dashboards/import",
            {
                "document": {
                    "schema": DASHBOARD_EXPORT_SCHEMA,
                    "version": DASHBOARD_EXPORT_VERSION,
                    "name": "服务总览",
                    "layout": {},
                    "config": {},
                }
            },
        ),
        ("GET", "/api/v1/projects/1/dashboards/1", None),
        ("GET", "/api/v1/projects/1/dashboards/1/export", None),
        ("GET", "/api/v1/projects/1/dashboards/1/panels/cpu/preview", None),
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


def test_dashboard_template_list_and_read_return_valid_service_overview_template() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="template-reader")

    list_response = client.get("/api/v1/dashboard-templates", headers=auth_headers)

    assert list_response.status_code == 200
    templates = list_response.json()["items"]
    assert [template["id"] for template in templates] == ["service-overview"]
    template = templates[0]
    assert template["name"] == "服务总览"
    assert template["description"]

    config = cast(dict[str, Any], template["config"])
    assert config["time_range"] == {"mode": "relative", "relative": "1h"}
    variables = cast(list[dict[str, Any]], config["variables"])
    panels = cast(list[dict[str, Any]], config["panels"])
    assert [variable["name"] for variable in variables] == [
        "service_source",
        "log_level",
        "row_limit",
    ]
    assert {panel["type"] for panel in panels} == {"metrics", "logs", "traces", "topology"}
    assert {panel["id"] for panel in panels} == {
        "latency-trend",
        "recent-logs",
        "recent-traces",
        "service-topology",
    }

    validated = DashboardCreate(
        project_id=1,
        name=template["name"],
        description=template["description"],
        layout=template["layout"],
        config=template["config"],
    )
    assert validated.layout == template["layout"]
    assert validated.config == template["config"]

    read_response = client.get(
        "/api/v1/dashboard-templates/service-overview",
        headers=auth_headers,
    )

    assert read_response.status_code == 200
    assert read_response.json() == template


def test_dashboard_template_unknown_template_returns_404_for_read_and_create() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="template-missing-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])

    read_response = client.get(
        "/api/v1/dashboard-templates/missing-template",
        headers=auth_headers,
    )
    create_response = client.post(
        f"/api/v1/projects/{project_id}/dashboard-templates/missing-template/dashboards",
        headers=auth_headers,
        json={},
    )

    assert read_response.status_code == 404
    assert read_response.json()["detail"] == "仪表盘模板不存在"
    assert create_response.status_code == 404
    assert create_response.json()["detail"] == "仪表盘模板不存在"


def test_dashboard_template_create_persists_normal_dashboard_and_can_be_read() -> None:
    client = build_client()
    owner, owner_headers = create_auth_headers(client, username="template-owner")
    project = create_project(client, owner_headers)
    project_id = cast(int, project["id"])

    create_response = client.post(
        f"/api/v1/projects/{project_id}/dashboard-templates/service-overview/dashboards",
        headers=owner_headers,
        json={},
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["project_id"] == project_id
    assert dashboard["name"] == "服务总览"
    assert dashboard["description"]
    assert dashboard["created_by_user_id"] == owner.id
    assert dashboard["updated_by_user_id"] == owner.id

    config = cast(dict[str, Any], dashboard["config"])
    panels = cast(list[dict[str, Any]], config["panels"])
    assert config["time_range"] == {"mode": "relative", "relative": "1h"}
    assert {panel["type"] for panel in panels} == {"metrics", "logs", "traces", "topology"}

    get_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=owner_headers,
    )
    preview_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}/panels/latency-trend/preview",
        headers=owner_headers,
    )

    assert get_response.status_code == 200
    assert get_response.json() == dashboard
    assert preview_response.status_code == 200
    assert preview_response.json()["preview"]["kind"] == "metrics"
    assert preview_response.json()["preview"]["items"] == []


def test_dashboard_template_create_uses_permissions_and_rejects_config_injection() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="template-permission-owner")
    viewer, viewer_headers = create_auth_headers(client, username="template-viewer")
    _, stranger_headers = create_auth_headers(client, username="template-stranger")
    project_a = create_project(client, owner_headers, name="项目 A", key="template-project-a")
    project_b = create_project(client, owner_headers, name="项目 B", key="template-project-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )

    viewer_response = client.post(
        f"/api/v1/projects/{project_a_id}/dashboard-templates/service-overview/dashboards",
        headers=viewer_headers,
        json={},
    )
    stranger_response = client.post(
        f"/api/v1/projects/{project_a_id}/dashboard-templates/service-overview/dashboards",
        headers=stranger_headers,
        json={},
    )
    injection_response = client.post(
        f"/api/v1/projects/{project_a_id}/dashboard-templates/service-overview/dashboards",
        headers=owner_headers,
        json={
            "project_id": project_b_id,
            "config": {"panels": []},
        },
    )
    override_response = client.post(
        f"/api/v1/projects/{project_a_id}/dashboard-templates/service-overview/dashboards",
        headers=owner_headers,
        json={
            "name": "自定义服务总览",
            "description": "团队排障入口",
        },
    )

    assert viewer_response.status_code == 403
    assert viewer_response.json()["detail"] == "无项目权限"
    assert stranger_response.status_code == 404
    assert stranger_response.json()["detail"] == "项目不存在"
    assert injection_response.status_code == 422
    assert {error["loc"][-1] for error in injection_response.json()["detail"]} == {
        "project_id",
        "config",
    }
    assert override_response.status_code == 201
    assert override_response.json()["project_id"] == project_a_id
    assert override_response.json()["name"] == "自定义服务总览"
    assert override_response.json()["description"] == "团队排障入口"


def test_dashboard_template_records_do_not_share_mutable_config_references() -> None:
    first = get_builtin_dashboard_template("service-overview")
    first_layout = cast(dict[str, Any], first.layout)
    first_config = cast(dict[str, Any], first.config)
    first_panels = cast(list[dict[str, Any]], first_config["panels"])
    first_variables = cast(list[dict[str, Any]], first_config["variables"])
    first_log_level_options = cast(list[str], first_variables[1]["options"])
    first_layout["columns"] = 99
    first_panels[0]["title"] = "mutated"
    first_log_level_options.append("debug")

    second = get_builtin_dashboard_template("service-overview")
    second_layout = cast(dict[str, Any], second.layout)
    second_config = cast(dict[str, Any], second.config)
    second_panels = cast(list[dict[str, Any]], second_config["panels"])
    second_variables = cast(list[dict[str, Any]], second_config["variables"])

    assert second_layout["columns"] == 12
    assert second_panels[0]["title"] == "请求延迟趋势"
    assert second_variables[1]["options"] == ["error", "warn", "info"]


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


def test_dashboard_export_returns_portable_document_without_instance_fields() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="export-owner")
    viewer, viewer_headers = create_auth_headers(client, username="export-viewer")
    _, stranger_headers = create_auth_headers(client, username="export-stranger")
    project_a = create_project(client, owner_headers, name="项目 A", key="export-project-a")
    project_b = create_project(client, owner_headers, name="项目 B", key="export-project-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    dashboard_config = {
        "refresh_seconds": 30,
        "time_range": {"mode": "relative", "relative": "1h"},
        **_dashboard_panel_config(),
        "variables": _dashboard_variable_config()["variables"],
    }
    create_response = client.post(
        "/api/v1/dashboards",
        headers=owner_headers,
        json={
            "project_id": project_a_id,
            "name": "可导出仪表盘",
            "description": "用于跨项目导入",
            "layout": {"version": 1, "widgets": [{"i": "latency-p95"}]},
            "config": dashboard_config,
        },
    )
    assert create_response.status_code == 201
    dashboard = create_response.json()

    owner_response = client.get(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard['id']}/export",
        headers=owner_headers,
    )
    viewer_response = client.get(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard['id']}/export",
        headers=viewer_headers,
    )
    stranger_response = client.get(
        f"/api/v1/projects/{project_a_id}/dashboards/{dashboard['id']}/export",
        headers=stranger_headers,
    )
    cross_project_response = client.get(
        f"/api/v1/projects/{project_b_id}/dashboards/{dashboard['id']}/export",
        headers=owner_headers,
    )

    assert owner_response.status_code == 200
    exported = owner_response.json()
    assert exported == viewer_response.json()
    assert exported == {
        "schema": DASHBOARD_EXPORT_SCHEMA,
        "version": DASHBOARD_EXPORT_VERSION,
        "name": "可导出仪表盘",
        "description": "用于跨项目导入",
        "layout": {"version": 1, "widgets": [{"i": "latency-p95"}]},
        "config": dashboard_config,
    }
    assert not {
        "id",
        "project_id",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at",
    } & set(exported)
    assert viewer_response.status_code == 200
    assert stranger_response.status_code == 404
    assert stranger_response.json()["detail"] == "项目不存在"
    assert cross_project_response.status_code == 404
    assert cross_project_response.json()["detail"] == "仪表盘不存在"


def test_dashboard_import_creates_normal_dashboard_and_supports_overrides() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="import-owner")
    project_a = create_project(client, owner_headers, name="导出项目", key="import-source")
    project_b = create_project(client, owner_headers, name="导入项目", key="import-target")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    source_dashboard = create_dashboard(
        client,
        owner_headers,
        project_id=project_a_id,
        name="源仪表盘",
    )
    export_response = client.get(
        f"/api/v1/projects/{project_a_id}/dashboards/{source_dashboard['id']}/export",
        headers=owner_headers,
    )
    assert export_response.status_code == 200
    document = export_response.json()

    import_response = client.post(
        f"/api/v1/projects/{project_b_id}/dashboards/import",
        headers=owner_headers,
        json={
            "document": document,
            "name": "导入副本",
            "description": None,
        },
    )
    fallback_response = client.post(
        f"/api/v1/projects/{project_b_id}/dashboards/import",
        headers=owner_headers,
        json={"document": document},
    )

    assert import_response.status_code == 201
    imported = import_response.json()
    assert imported["id"] != source_dashboard["id"]
    assert imported["project_id"] == project_b_id
    assert imported["name"] == "导入副本"
    assert imported["description"] is None
    assert imported["layout"] == source_dashboard["layout"]
    assert imported["config"] == source_dashboard["config"]
    assert imported["created_by_user_id"] == imported["updated_by_user_id"]
    assert imported["created_at"]
    assert imported["updated_at"]

    patch_response = client.patch(
        f"/api/v1/projects/{project_b_id}/dashboards/{imported['id']}",
        headers=owner_headers,
        json={"name": "普通仪表盘可编辑"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["name"] == "普通仪表盘可编辑"

    assert fallback_response.status_code == 201
    fallback_dashboard = fallback_response.json()
    assert fallback_dashboard["name"] == document["name"]
    assert fallback_dashboard["description"] == document["description"]


def test_dashboard_import_uses_project_permissions_and_hiding_semantics() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="import-permission-owner")
    viewer, viewer_headers = create_auth_headers(client, username="import-viewer")
    _, stranger_headers = create_auth_headers(client, username="import-stranger")
    project = create_project(client, owner_headers, name="导入权限项目", key="import-permission")
    project_id = cast(int, project["id"])
    grant_project_role(
        client,
        project_id=project_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    document = {
        "schema": DASHBOARD_EXPORT_SCHEMA,
        "version": DASHBOARD_EXPORT_VERSION,
        "name": "导入权限",
        "description": None,
        "layout": {},
        "config": {},
    }

    viewer_response = client.post(
        f"/api/v1/projects/{project_id}/dashboards/import",
        headers=viewer_headers,
        json={"document": document},
    )
    stranger_response = client.post(
        f"/api/v1/projects/{project_id}/dashboards/import",
        headers=stranger_headers,
        json={"document": document},
    )
    missing_project_response = client.post(
        "/api/v1/projects/999999/dashboards/import",
        headers=owner_headers,
        json={"document": document},
    )

    assert viewer_response.status_code == 403
    assert viewer_response.json()["detail"] == "无项目权限"
    assert stranger_response.status_code == 404
    assert stranger_response.json()["detail"] == "项目不存在"
    assert missing_project_response.status_code == 404
    assert missing_project_response.json()["detail"] == "项目不存在"


@pytest.mark.parametrize(
    "document_patch",
    [
        {"schema_name": DASHBOARD_EXPORT_SCHEMA},
        {"schema": "telemetry.dashboard.v2"},
        {"version": "1"},
        {"version": True},
        {"version": DASHBOARD_EXPORT_VERSION + 1},
        {"layout": None},
        {"config": None},
        {"config": {"panels": [{"id": "cpu", "title": "CPU", "type": "unknown", "query": {}}]}},
        {"config": {"time_range": {"mode": "relative", "relative": "10m"}}},
        {"config": {"variables": [{"name": "1env", "type": "text"}]}},
        {"id": 1},
        {"project_id": 1},
        {"created_by_user_id": 1},
        {"updated_by_user_id": 1},
        {"created_at": "2026-06-25T00:00:00Z"},
        {"updated_at": "2026-06-25T00:00:00Z"},
    ],
)
def test_dashboard_import_rejects_invalid_or_nonportable_document(
    document_patch: dict[str, Any],
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="import-invalid-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    document = {
        "schema": DASHBOARD_EXPORT_SCHEMA,
        "version": DASHBOARD_EXPORT_VERSION,
        "name": "导入非法文档",
        "description": None,
        "layout": {},
        "config": {},
    }
    document.update(document_patch)

    response = client.post(
        f"/api/v1/projects/{project_id}/dashboards/import",
        headers=auth_headers,
        json={"document": document},
    )

    assert response.status_code == 422
    assert response.json()["detail"]


@pytest.mark.parametrize(
    "missing_field",
    ["schema", "version", "name", "description", "layout", "config"],
)
def test_dashboard_import_requires_export_document_fields(missing_field: str) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username=f"import-missing-{missing_field}")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    document = {
        "schema": DASHBOARD_EXPORT_SCHEMA,
        "version": DASHBOARD_EXPORT_VERSION,
        "name": "导入缺字段",
        "description": None,
        "layout": {},
        "config": {},
    }
    document.pop(missing_field)

    response = client.post(
        f"/api/v1/projects/{project_id}/dashboards/import",
        headers=auth_headers,
        json={"document": document},
    )

    assert response.status_code == 422
    assert any(missing_field in error["loc"] for error in response.json()["detail"])


def test_dashboard_export_document_requires_public_schema_and_strict_version() -> None:
    from app.schemas.dashboard import DashboardExportDocument

    with pytest.raises(ValidationError):
        DashboardExportDocument.model_validate(
            {
                "schema_name": DASHBOARD_EXPORT_SCHEMA,
                "version": DASHBOARD_EXPORT_VERSION,
                "name": "导入非法文档",
                "description": None,
                "layout": {},
                "config": {},
            }
        )

    with pytest.raises(ValidationError):
        DashboardExportDocument.model_validate(
            {
                "schema": DASHBOARD_EXPORT_SCHEMA,
                "version": "1",
                "name": "导入非法文档",
                "description": None,
                "layout": {},
                "config": {},
            }
        )


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
def test_dashboard_import_reuses_dashboard_json_payload_limits(
    field_name: str,
    invalid_value: Any,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username=f"import-limit-{field_name}")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    headers = _json_request_headers(auth_headers)
    document = {
        "schema": DASHBOARD_EXPORT_SCHEMA,
        "version": DASHBOARD_EXPORT_VERSION,
        "name": "导入非法 JSON",
        "description": None,
        "layout": {},
        "config": {},
        field_name: invalid_value,
    }

    response = client.post(
        f"/api/v1/projects/{project_id}/dashboards/import",
        headers=headers,
        content=_dashboard_content({"document": document}),
    )

    assert response.status_code == 422
    assert any(field_name in error["loc"] for error in response.json()["detail"])


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


def test_dashboard_time_range_config_normalizes_for_create_and_update() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="time-range-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Time range dashboard",
            "config": {
                "refresh_seconds": 30,
                "time_range": {"mode": " relative ", "relative": " 15m "},
            },
        },
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["config"] == {
        "refresh_seconds": 30,
        "time_range": {"mode": "relative", "relative": "15m"},
    }

    update_config = {
        "time_range": {
            "mode": "\tabsolute\n",
            "from": " 2026-06-24T00:00:00Z ",
            "to": "\t2026-06-24T01:00:00+00:00\n",
        }
    }
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"config": update_config},
    )

    assert update_response.status_code == 200
    assert update_response.json()["config"] == {
        "time_range": {
            "mode": "absolute",
            "from": "2026-06-24T00:00:00Z",
            "to": "2026-06-24T01:00:00+00:00",
        }
    }


def test_dashboard_create_and_update_accept_variable_config() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="variable-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    config = _dashboard_variable_config()

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Variable dashboard",
            "config": config,
        },
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["config"] == config

    updated_config = {
        "variables": [
            {
                "name": "region",
                "label": "Region",
                "type": "select",
                "default": "ap-southeast-1",
                "options": ["us-east-1", "ap-southeast-1"],
            }
        ]
    }
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard['id']}",
        headers=auth_headers,
        json={"config": updated_config},
    )

    assert update_response.status_code == 200
    assert update_response.json()["config"] == updated_config


def test_dashboard_variable_config_normalizes_string_fields_for_create_and_update() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="normalized-variable-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])

    create_config = {
        "variables": [
            {
                "name": " env ",
                "label": " Environment ",
                "type": " select ",
                "default": " prod ",
                "options": [" prod ", "\tstaging\n"],
            }
        ]
    }
    expected_create_config = {
        "variables": [
            {
                "name": "env",
                "label": "Environment",
                "type": "select",
                "default": "prod",
                "options": ["prod", "staging"],
            }
        ]
    }
    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Normalized variable dashboard",
            "config": create_config,
        },
    )

    assert create_response.status_code == 201
    dashboard = create_response.json()
    assert dashboard["config"] == expected_create_config
    assert dashboard["config"]["variables"][0]["name"] == "env"

    update_config = {
        "variables": [
            {
                "name": "\tservice_name\n",
                "label": "\tService\n",
                "type": "\ttext\n",
                "default": "\tcheckout\n",
            }
        ]
    }
    expected_update_config = {
        "variables": [
            {
                "name": "service_name",
                "label": "Service",
                "type": "text",
                "default": "checkout",
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


def test_dashboard_config_keeps_legacy_config_without_variables_compatible() -> None:
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


@pytest.mark.parametrize(
    "invalid_time_range",
    [
        "24h",
        [],
        None,
        {"mode": "last", "relative": "15m"},
        {"mode": "relative"},
        {"mode": "relative", "relative": "10m"},
        {"mode": "relative", "relative": ""},
        {"mode": "relative", "relative": 15},
        {"mode": "absolute", "from": "2026-06-24T00:00:00Z"},
        {
            "mode": "absolute",
            "from": 1,
            "to": "2026-06-24T01:00:00Z",
        },
        {
            "mode": "absolute",
            "from": "",
            "to": "2026-06-24T01:00:00Z",
        },
        {
            "mode": "absolute",
            "from": "not-a-time",
            "to": "2026-06-24T01:00:00Z",
        },
        {
            "mode": "absolute",
            "from": "2026-06-24T01:00:00Z",
            "to": "2026-06-24T01:00:00Z",
        },
        {
            "mode": "absolute",
            "from": "2026-06-24T02:00:00Z",
            "to": "2026-06-24T01:00:00Z",
        },
        {
            "mode": "absolute",
            "from": "2026-06-24T00:00:00Z",
            "to": "2026-06-24T01:00:00",
        },
    ],
)
def test_dashboard_invalid_time_range_config_is_reported_as_422(
    invalid_time_range: Any,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="invalid-time-range-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)
    invalid_config = {"time_range": invalid_time_range}

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid time range config",
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


def test_dashboard_panel_preview_returns_saved_panel_query_samples() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    metrics_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "http.duration",
                    "value": 10,
                    "unit": "ms",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:05Z",
                },
                {
                    "name": "http.duration",
                    "value": 20,
                    "unit": "ms",
                    "source": "api",
                    "timestamp": "2026-06-20T10:04:59Z",
                },
                {
                    "name": "http.duration",
                    "value": 200,
                    "unit": "ms",
                    "source": "api",
                    "timestamp": "2026-06-20T10:06:00Z",
                },
            ]
        },
    )
    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "boom",
                    "source": "api",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "level": "info",
                    "message": "ignored",
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "outside dashboard time",
                    "source": "api",
                    "timestamp": "2026-06-20T10:06:00Z",
                },
            ]
        },
    )
    events_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "type": "deployment",
            "source": "ci",
            "timestamp": "2026-06-20T10:03:00Z",
            "payload": {"version": "2026.6.20"},
        },
    )
    outside_events_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "type": "deployment",
            "source": "ci",
            "timestamp": "2026-06-20T10:06:00Z",
            "payload": {"version": "outside"},
        },
    )
    traces_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "trace-preview",
                    "span_id": "api-root",
                    "name": "GET /orders",
                    "start_time": "2026-06-20T10:04:00Z",
                    "duration_ms": 100,
                    "status_code": "ok",
                    "source": "api",
                },
                {
                    "trace_id": "trace-preview",
                    "span_id": "worker-child",
                    "parent_span_id": "api-root",
                    "name": "process order",
                    "start_time": "2026-06-20T10:04:00.010Z",
                    "duration_ms": 50,
                    "status_code": "error",
                    "source": "worker",
                },
                {
                    "trace_id": "trace-outside",
                    "span_id": "api-root-outside",
                    "name": "GET /orders",
                    "start_time": "2026-06-20T10:06:00Z",
                    "duration_ms": 120,
                    "status_code": "ok",
                    "source": "api",
                },
                {
                    "trace_id": "trace-outside",
                    "span_id": "worker-child-outside",
                    "parent_span_id": "api-root-outside",
                    "name": "process order",
                    "start_time": "2026-06-20T10:06:00.010Z",
                    "duration_ms": 60,
                    "status_code": "error",
                    "source": "worker",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Preview dashboard",
            "config": {
                "time_range": {
                    "mode": "absolute",
                    "from": "2026-06-20T10:00:00Z",
                    "to": "2026-06-20T10:05:00Z",
                },
                "variables": [
                    {
                        "name": "service_name",
                        "label": "Service",
                        "type": "text",
                        "default": "api",
                    }
                ],
                "panels": [
                    {
                        "id": "latency",
                        "title": "Latency",
                        "type": "metrics",
                        "query": {
                            "name": "http.duration",
                            "source": "api",
                            "window": "5m",
                            "aggregation": "avg",
                            "limit": 5,
                        },
                    },
                    {
                        "id": "errors",
                        "title": "Errors",
                        "type": "logs",
                        "query": {"level": "error", "limit": 1},
                    },
                    {
                        "id": "deployments",
                        "title": "Deployments",
                        "type": "events",
                        "query": {"type": "deployment", "source": "ci", "limit": 1},
                    },
                    {
                        "id": "trace-list",
                        "title": "Trace list",
                        "type": "traces",
                        "query": {"name": "GET /orders", "limit": 2},
                    },
                    {
                        "id": "topology",
                        "title": "Topology",
                        "type": "topology",
                        "query": {"source": "api", "limit": 5},
                    },
                ],
            },
        },
    )

    assert metrics_response.status_code == 202
    assert logs_response.status_code == 202
    assert events_response.status_code == 202
    assert outside_events_response.status_code == 202
    assert traces_response.status_code == 202
    assert dashboard_response.status_code == 201
    dashboard_id = dashboard_response.json()["id"]

    metrics_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/latency/preview",
        headers=auth_headers,
    )
    logs_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/errors/preview",
        headers=auth_headers,
    )
    events_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/deployments/preview",
        headers=auth_headers,
    )
    traces_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/trace-list/preview",
        headers=auth_headers,
    )
    topology_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/topology/preview",
        headers=auth_headers,
    )

    assert metrics_preview.status_code == 200
    metrics_body = metrics_preview.json()
    assert metrics_body["panel_id"] == "latency"
    assert metrics_body["panel_type"] == "metrics"
    assert metrics_body["query"] == {
        "name": "http.duration",
        "source": "api",
        "window": "5m",
        "aggregation": "avg",
        "limit": 5,
    }
    assert metrics_body["preview"]["kind"] == "metrics"
    assert metrics_body["preview"]["mode"] == "aggregate"
    assert metrics_body["preview"]["items"][0]["name"] == "http.duration"
    assert metrics_body["preview"]["items"][0]["value"] == 15.0
    assert metrics_body["preview"]["items"][0]["sample_count"] == 2

    assert logs_preview.status_code == 200
    assert [log["message"] for log in logs_preview.json()["preview"]["items"]] == ["boom"]
    assert events_preview.status_code == 200
    event_items = events_preview.json()["preview"]["items"]
    assert [event["payload"] for event in event_items] == [{"version": "2026.6.20"}]
    assert traces_preview.status_code == 200
    assert [trace["trace_id"] for trace in traces_preview.json()["preview"]["items"]] == [
        "trace-preview"
    ]
    assert topology_preview.status_code == 200
    topology_body = topology_preview.json()
    assert {node["source"] for node in topology_body["preview"]["nodes"]} == {"api", "worker"}
    assert topology_body["preview"]["edges"] == [
        {
            "from_source": "api",
            "to_source": "worker",
            "call_count": 1,
            "error_count": 1,
            "avg_duration_ms": 50,
            "max_duration_ms": 50,
        }
    ]


def test_dashboard_panel_preview_resolves_variable_defaults_before_query_execution() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-variable-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "matched variable defaults",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "error",
                    "message": "ignored source",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "level": "info",
                    "message": "ignored level",
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Variable preview dashboard",
            "config": {
                "variables": [
                    {
                        "name": "service_source",
                        "label": "Service source",
                        "type": "text",
                        "default": "api",
                    },
                    {
                        "name": "log_level",
                        "label": "Log level",
                        "type": "select",
                        "options": ["info", "error"],
                        "default": "error",
                    },
                    {
                        "name": "row_limit",
                        "label": "Row limit",
                        "type": "number",
                        "default": 5,
                    },
                ],
                "panels": [
                    {
                        "id": "errors",
                        "title": "Errors",
                        "type": "logs",
                        "query": {
                            "source": "${service_source}",
                            "level": "${log_level}",
                            "limit": "${row_limit}",
                        },
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/errors/preview"
        ),
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    preview_body = preview_response.json()
    assert preview_body["query"] == {
        "source": "${service_source}",
        "level": "${log_level}",
        "limit": "${row_limit}",
    }
    assert [log["message"] for log in preview_body["preview"]["items"]] == [
        "matched variable defaults"
    ]


def test_dashboard_panel_preview_variable_overrides_take_precedence_over_defaults() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-variable-override-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "matched variable defaults",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "info",
                    "message": "matched variable overrides",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Variable override preview dashboard",
            "config": {
                "variables": [
                    {"name": "service_source", "type": "text", "default": "api"},
                    {
                        "name": "log_level",
                        "type": "select",
                        "options": ["error", "info"],
                        "default": "error",
                    },
                    {"name": "row_limit", "type": "number", "default": 5},
                ],
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {
                            "source": "${service_source}",
                            "level": "${log_level}",
                            "limit": "${row_limit}",
                        },
                    }
                ],
            },
        },
    )
    dashboard_id = dashboard_response.json()["id"]
    variables = {"service_source": "worker", "log_level": "info", "row_limit": 1}

    preview_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/logs/preview",
        headers=auth_headers,
        params={"variables": json.dumps(variables)},
    )
    dashboard_after_preview = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}",
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    preview_body = preview_response.json()
    assert preview_body["query"] == {
        "source": "${service_source}",
        "level": "${log_level}",
        "limit": "${row_limit}",
    }
    assert [log["message"] for log in preview_body["preview"]["items"]] == [
        "matched variable overrides"
    ]
    assert dashboard_after_preview.status_code == 200
    assert dashboard_after_preview.json()["config"] == dashboard_response.json()["config"]


def test_dashboard_panel_preview_variable_override_supplies_missing_default() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(
        client,
        username="preview-variable-missing-default-override-owner",
    )
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "matched missing default override",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Missing default override preview dashboard",
            "config": {
                "variables": [{"name": "service_source", "type": "text"}],
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {"source": "${service_source}", "limit": 5},
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/logs/preview"
        ),
        headers=auth_headers,
        params={"variables": json.dumps({"service_source": "api"})},
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    assert [log["message"] for log in preview_response.json()["preview"]["items"]] == [
        "matched missing default override"
    ]


@pytest.mark.parametrize(
    ("variables", "expected_detail"),
    [
        ({"log_level": "debug"}, "panel.query 变量 log_level.override 必须匹配 options"),
        ({"log_level": 1}, "panel.query 变量 log_level.override 必须是字符串"),
        ({"row_limit": True}, "panel.query 变量 row_limit.override 必须是有限数值"),
        ({"row_limit": "1"}, "panel.query 变量 row_limit.override 必须是有限数值"),
        ({"row_limit": 101}, "panel.query.limit 必须在 1..100 之间"),
        ({"row_limit": int("9" * 400)}, "panel.query.limit 必须在 1..100 之间"),
    ],
)
def test_dashboard_panel_preview_rejects_invalid_select_and_number_overrides(
    variables: dict[str, Any],
    expected_detail: str,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username=f"preview-bad-override-{len(variables)}")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid override preview dashboard",
            "config": {
                "variables": [
                    {
                        "name": "log_level",
                        "type": "select",
                        "options": ["error", "info"],
                        "default": "error",
                    },
                    {"name": "row_limit", "type": "number", "default": 5},
                ],
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {
                            "level": "${log_level}",
                            "limit": "${row_limit}",
                        },
                    }
                ],
            },
        },
    )

    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/logs/preview"
        ),
        headers=auth_headers,
        params={"variables": json.dumps(variables)},
    )

    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 422
    assert preview_response.json()["detail"] == expected_detail


@pytest.mark.parametrize(
    ("raw_variables", "expected_detail"),
    [
        ("not-json", "variables 必须是合法 JSON 对象"),
        ("[]", "variables 必须是 JSON 对象"),
        ('{"row_limit": NaN}', "variables 必须是合法 JSON 对象"),
        (json.dumps({"unknown": "api"}), "variables.unknown 未定义"),
        (
            json.dumps({"service_source": 1}),
            "panel.query 变量 service_source.override 必须是字符串",
        ),
    ],
)
def test_dashboard_panel_preview_reports_variable_override_request_errors_as_422(
    raw_variables: str,
    expected_detail: str,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-override-error-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Override error preview dashboard",
            "config": {
                "variables": [
                    {"name": "service_source", "type": "text", "default": "api"},
                    {"name": "row_limit", "type": "number", "default": 5},
                ],
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {"source": "${service_source}", "limit": "${row_limit}"},
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/logs/preview"
        ),
        headers=auth_headers,
        params={"variables": raw_variables},
    )

    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 422
    assert preview_response.json()["detail"] == expected_detail


def test_dashboard_panel_preview_reports_large_number_float_override_as_422() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-large-float-override-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Large float override preview dashboard",
            "config": {
                "variables": [
                    {
                        "name": "min_duration",
                        "type": "number",
                        "default": 1,
                    }
                ],
                "panels": [
                    {
                        "id": "slow-traces",
                        "title": "Slow traces",
                        "type": "traces",
                        "query": {
                            "duration_min_ms": "${min_duration}",
                            "limit": 5,
                        },
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/slow-traces/preview"
        ),
        headers=auth_headers,
        params={"variables": json.dumps({"min_duration": int("9" * 400)})},
    )

    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 422
    assert preview_response.json()["detail"] == "panel.query.duration_min_ms 必须是有限数值"


def test_dashboard_panel_preview_inherits_relative_time_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.routes import dashboard as dashboard_route

    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-relative-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)
    monkeypatch.setattr(
        dashboard_route,
        "_preview_now",
        lambda: datetime(2026, 6, 20, 10, 15, tzinfo=UTC),
    )

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "inside relative range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "error",
                    "message": "outside relative range",
                    "source": "api",
                    "timestamp": "2026-06-20T09:59:59Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Relative preview dashboard",
            "config": {
                "time_range": {"mode": "relative", "relative": "15m"},
                "panels": [
                    {
                        "id": "errors",
                        "title": "Errors",
                        "type": "logs",
                        "query": {"level": "error", "limit": 5},
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/errors/preview"
        ),
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    assert [log["message"] for log in preview_response.json()["preview"]["items"]] == [
        "inside relative range"
    ]


def test_dashboard_panel_preview_panel_time_overrides_dashboard_time_range() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-time-override-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "dashboard range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "panel explicit range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:06:00Z",
                },
                {
                    "level": "error",
                    "message": "after dashboard to",
                    "source": "api",
                    "timestamp": "2026-06-20T10:07:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Panel override preview dashboard",
            "config": {
                "time_range": {
                    "mode": "absolute",
                    "from": "2026-06-20T10:00:00Z",
                    "to": "2026-06-20T10:06:00Z",
                },
                "panels": [
                    {
                        "id": "explicit-from",
                        "title": "Explicit from",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "occurred_from": "2026-06-20T10:05:00Z",
                            "limit": 5,
                        },
                    },
                    {
                        "id": "explicit-to",
                        "title": "Explicit to",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "occurred_to": "2026-06-20T10:02:00Z",
                            "limit": 5,
                        },
                    },
                ],
            },
        },
    )

    explicit_from_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/explicit-from/preview"
        ),
        headers=auth_headers,
    )
    explicit_to_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/explicit-to/preview"
        ),
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert explicit_from_response.status_code == 200
    assert [log["message"] for log in explicit_from_response.json()["preview"]["items"]] == [
        "panel explicit range"
    ]
    assert explicit_to_response.status_code == 200
    assert [log["message"] for log in explicit_to_response.json()["preview"]["items"]] == [
        "dashboard range"
    ]


def test_dashboard_panel_preview_variable_time_defaults_override_dashboard_time_range() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-variable-time-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "dashboard range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "panel variable range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:06:00Z",
                },
                {
                    "level": "error",
                    "message": "after dashboard to",
                    "source": "api",
                    "timestamp": "2026-06-20T10:07:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Variable time preview dashboard",
            "config": {
                "time_range": {
                    "mode": "absolute",
                    "from": "2026-06-20T10:00:00Z",
                    "to": "2026-06-20T10:06:00Z",
                },
                "variables": [
                    {
                        "name": "range_from",
                        "label": "Range from",
                        "type": "text",
                        "default": "2026-06-20T10:05:00Z",
                    },
                    {
                        "name": "range_to",
                        "label": "Range to",
                        "type": "text",
                        "default": "2026-06-20T10:02:00Z",
                    },
                ],
                "panels": [
                    {
                        "id": "explicit-from-variable",
                        "title": "Explicit from variable",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "occurred_from": "${range_from}",
                            "limit": 5,
                        },
                    },
                    {
                        "id": "explicit-to-variable",
                        "title": "Explicit to variable",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "occurred_to": "${range_to}",
                            "limit": 5,
                        },
                    },
                ],
            },
        },
    )

    explicit_from_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/explicit-from-variable/preview"
        ),
        headers=auth_headers,
    )
    explicit_to_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/explicit-to-variable/preview"
        ),
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert explicit_from_response.status_code == 200
    assert [log["message"] for log in explicit_from_response.json()["preview"]["items"]] == [
        "panel variable range"
    ]
    assert explicit_to_response.status_code == 200
    assert [log["message"] for log in explicit_to_response.json()["preview"]["items"]] == [
        "dashboard range"
    ]


def test_dashboard_panel_preview_variable_time_overrides_override_dashboard_time_range() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(
        client,
        username="preview-variable-time-request-override-owner",
    )
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "dashboard range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "request variable range",
                    "source": "api",
                    "timestamp": "2026-06-20T10:05:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Variable time override preview dashboard",
            "config": {
                "time_range": {
                    "mode": "absolute",
                    "from": "2026-06-20T10:00:00Z",
                    "to": "2026-06-20T10:04:00Z",
                },
                "variables": [
                    {
                        "name": "range_from",
                        "type": "text",
                        "default": "2026-06-20T10:00:00Z",
                    },
                    {
                        "name": "range_to",
                        "type": "text",
                        "default": "2026-06-20T10:04:00Z",
                    },
                ],
                "panels": [
                    {
                        "id": "explicit-range-variable",
                        "title": "Explicit range variable",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "occurred_from": "${range_from}",
                            "occurred_to": "${range_to}",
                            "limit": 5,
                        },
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/explicit-range-variable/preview"
        ),
        headers=auth_headers,
        params={
            "variables": json.dumps(
                {
                    "range_from": "2026-06-20T10:04:30Z",
                    "range_to": "2026-06-20T10:06:00Z",
                }
            )
        },
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    assert preview_response.json()["query"] == {
        "level": "error",
        "occurred_from": "${range_from}",
        "occurred_to": "${range_to}",
        "limit": 5,
    }
    assert [log["message"] for log in preview_response.json()["preview"]["items"]] == [
        "request variable range"
    ]


def test_dashboard_panel_preview_reports_invalid_variable_templates_as_422() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-variable-invalid-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid variable preview",
            "config": {
                "variables": [
                    {"name": "source", "type": "text", "default": "api"},
                    {"name": "missing_default", "type": "text"},
                    {"name": "row_limit", "type": "number", "default": 5},
                ],
                "panels": [
                    {
                        "id": "unknown-variable",
                        "title": "Unknown variable",
                        "type": "logs",
                        "query": {"source": "${unknown_source}"},
                    },
                    {
                        "id": "missing-default",
                        "title": "Missing default",
                        "type": "logs",
                        "query": {"source": "${missing_default}"},
                    },
                    {
                        "id": "invalid-template",
                        "title": "Invalid template",
                        "type": "logs",
                        "query": {"source": "svc-${source}"},
                    },
                    {
                        "id": "invalid-type",
                        "title": "Invalid type",
                        "type": "logs",
                        "query": {"source": "${row_limit}"},
                    },
                ],
            },
        },
    )

    unknown_variable_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/unknown-variable/preview"
        ),
        headers=auth_headers,
    )
    missing_default_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/missing-default/preview"
        ),
        headers=auth_headers,
    )
    invalid_template_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/invalid-template/preview"
        ),
        headers=auth_headers,
    )
    invalid_type_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/invalid-type/preview"
        ),
        headers=auth_headers,
    )

    assert dashboard_response.status_code == 201
    assert unknown_variable_response.status_code == 422
    assert unknown_variable_response.json()["detail"] == "panel.query 变量 unknown_source 未定义"
    assert missing_default_response.status_code == 422
    assert missing_default_response.json()["detail"] == (
        "panel.query 变量 missing_default 缺少 default"
    )
    assert invalid_template_response.status_code == 422
    assert invalid_template_response.json()["detail"] == "panel.query 变量模板语法无效"
    assert invalid_type_response.status_code == 422
    assert invalid_type_response.json()["detail"] == "panel.query.source 必须是字符串"


def test_dashboard_panel_preview_does_not_replace_nested_variable_templates() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-nested-variable-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, auth_headers, project_id=project_id)

    logs_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "api error",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "error",
                    "message": "worker error",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
            ]
        },
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Nested variable preview",
            "config": {
                "variables": [{"name": "source", "type": "text", "default": "api"}],
                "panels": [
                    {
                        "id": "nested-filter",
                        "title": "Nested filter",
                        "type": "logs",
                        "query": {
                            "level": "error",
                            "filters": {"source": "${source}"},
                            "limit": 5,
                        },
                    }
                ],
            },
        },
    )
    preview_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/nested-filter/preview"
        ),
        headers=auth_headers,
    )

    assert logs_response.status_code == 202
    assert dashboard_response.status_code == 201
    assert preview_response.status_code == 200
    assert [log["message"] for log in preview_response.json()["preview"]["items"]] == [
        "worker error",
        "api error",
    ]


def test_dashboard_panel_preview_uses_viewer_permission_and_hides_unscoped_users() -> None:
    client = build_client()
    owner, owner_headers = create_auth_headers(client, username="preview-owner")
    viewer, viewer_headers = create_auth_headers(client, username="preview-viewer")
    _, stranger_headers = create_auth_headers(client, username="preview-stranger")
    project = create_project(client, owner_headers)
    project_id = cast(int, project["id"])
    grant_project_role(
        client,
        project_id=project_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=owner_headers,
        json={
            "project_id": project_id,
            "name": "Viewer preview",
            "config": {
                "panels": [
                    {
                        "id": "empty-logs",
                        "title": "Empty logs",
                        "type": "logs",
                        "query": {"limit": 5},
                    }
                ]
            },
        },
    )
    dashboard_id = dashboard_response.json()["id"]

    viewer_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/empty-logs/preview",
        headers=viewer_headers,
    )
    stranger_response = client.get(
        f"/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/empty-logs/preview",
        headers=stranger_headers,
    )

    assert owner.id != viewer.id
    assert dashboard_response.status_code == 201
    assert viewer_response.status_code == 200
    assert viewer_response.json()["preview"]["items"] == []
    assert stranger_response.status_code == 404
    assert stranger_response.json()["detail"] == "项目不存在"


def test_dashboard_panel_preview_hides_missing_panel_and_legacy_config() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-legacy-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    legacy_dashboard = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Legacy preview",
            "config": {"refresh_seconds": 30},
        },
    )
    panel_dashboard = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Panel preview",
            "config": {
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {},
                    }
                ]
            },
        },
    )

    legacy_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{legacy_dashboard.json()['id']}/panels/logs/preview"
        ),
        headers=auth_headers,
    )
    missing_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{panel_dashboard.json()['id']}/panels/missing/preview"
        ),
        headers=auth_headers,
    )

    assert legacy_dashboard.status_code == 201
    assert panel_dashboard.status_code == 201
    assert legacy_response.status_code == 404
    assert legacy_response.json()["detail"] == "panel 不存在"
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "panel 不存在"


def test_dashboard_panel_preview_reports_invalid_panel_query_as_422() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="preview-invalid-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid preview",
            "config": {
                "panels": [
                    {
                        "id": "logs",
                        "title": "Logs",
                        "type": "logs",
                        "query": {"limit": 101},
                    },
                    {
                        "id": "metric-window-list",
                        "title": "Metric window list",
                        "type": "metrics",
                        "query": {"window": ["5m"]},
                    },
                    {
                        "id": "metric-window-object",
                        "title": "Metric window object",
                        "type": "metrics",
                        "query": {"window": {"value": "5m"}},
                    },
                    {
                        "id": "metric-aggregation-list",
                        "title": "Metric aggregation list",
                        "type": "metrics",
                        "query": {"aggregation": ["avg"]},
                    },
                ]
            },
        },
    )

    response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/logs/preview"
        ),
        headers=auth_headers,
    )
    metric_window_list_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/metric-window-list/preview"
        ),
        headers=auth_headers,
    )
    metric_window_object_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/metric-window-object/preview"
        ),
        headers=auth_headers,
    )
    metric_aggregation_list_response = client.get(
        (
            f"/api/v1/projects/{project_id}/dashboards/"
            f"{dashboard_response.json()['id']}/panels/metric-aggregation-list/preview"
        ),
        headers=auth_headers,
    )

    assert dashboard_response.status_code == 201
    assert response.status_code == 422
    assert response.json()["detail"] == "panel.query.limit 必须在 1..100 之间"
    assert metric_window_list_response.status_code == 422
    assert metric_window_list_response.json()["detail"] == (
        "panel.query.window 必须是 1m/5m/15m/1h 之一"
    )
    assert metric_window_object_response.status_code == 422
    assert metric_window_object_response.json()["detail"] == (
        "panel.query.window 必须是 1m/5m/15m/1h 之一"
    )
    assert metric_aggregation_list_response.status_code == 422
    assert metric_aggregation_list_response.json()["detail"] == (
        "panel.query.aggregation 必须是 avg/sum/min/max/count 之一"
    )


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
    "invalid_config",
    [
        {"variables": "not-array"},
        {"variables": ["not-object"]},
        {"variables": [{"name": "env", "type": "unknown"}]},
        {"variables": [{"type": "text"}]},
        {"variables": [{"name": "env"}]},
        {"variables": [{"name": "", "type": "text"}]},
        {"variables": [{"name": "1env", "type": "text"}]},
        {"variables": [{"name": "service-name", "type": "text"}]},
        {"variables": [{"name": "env", "type": "text", "label": ""}]},
        {
            "variables": [
                {"name": "env", "type": "text"},
                {"name": "env", "type": "select", "options": ["prod"]},
            ]
        },
        {
            "variables": [
                {"name": " env ", "type": "text"},
                {"name": "env", "type": "select", "options": ["prod"]},
            ]
        },
        {"variables": [{"name": "env", "type": "text", "options": ["prod"]}]},
        {"variables": [{"name": "sample_rate", "type": "number", "options": [1]}]},
        {"variables": [{"name": "sample_rate", "type": "number", "default": "1"}]},
        {"variables": [{"name": "sample_rate", "type": "number", "default": True}]},
        {"variables": [{"name": "env", "type": "select"}]},
        {"variables": [{"name": "env", "type": "select", "options": "prod"}]},
        {"variables": [{"name": "env", "type": "select", "options": []}]},
        {"variables": [{"name": "env", "type": "select", "options": ["prod", " prod "]}]},
        {"variables": [{"name": "env", "type": "select", "options": ["prod", ""]}]},
        {
            "variables": [
                {"name": "env", "type": "select", "options": ["prod"], "default": "staging"}
            ]
        },
        {"variables": [{"name": "env", "type": "select", "options": ["prod"], "default": 1}]},
    ],
)
def test_dashboard_invalid_variable_config_is_reported_as_422(
    invalid_config: dict[str, Any],
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="invalid-variable-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    dashboard = create_dashboard(client, auth_headers, project_id=project_id)

    create_response = client.post(
        "/api/v1/dashboards",
        headers=auth_headers,
        json={
            "project_id": project_id,
            "name": "Invalid variable config",
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
