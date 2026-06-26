import json
from argparse import Namespace
from datetime import UTC, datetime, timedelta
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
from app.models.alerts import AlertRuleModel
from app.models.ingest import IngestRecordModel
from app.repositories.alerts import SqlAlchemyAlertRuleRepository
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.schemas.alerts import (
    MAX_ALERT_RULE_JSON_BYTES,
    MAX_ALERT_RULE_JSON_DEPTH,
    MAX_ALERT_RULE_JSON_NODES,
    AlertRuleSeverity,
    AlertRuleSignal,
)
from app.schemas.management import ResourceStatus
from app.schemas.permissions import ProjectRole
from app.services.auth import AuthService, hash_password
from app.services.errors import DuplicateResourceError, ResourceNotFoundError

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


def alert_rule_payload(
    *,
    project_id: int,
    name: str = "HTTP 5xx rate",
    severity: str = "critical",
    signal: str = "metrics",
    enabled: bool = True,
) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "name": name,
        "description": "5 分钟错误率过高",
        "enabled": enabled,
        "severity": severity,
        "signal": signal,
        "condition": {
            "metric": "http.server.errors",
            "operator": "gt",
            "threshold": 3,
        },
        "evaluation": {
            "window_seconds": 300,
            "interval_seconds": 60,
        },
    }


def create_alert_rule(
    client: TestClient,
    auth_headers: dict[str, str],
    *,
    project_id: int,
    name: str = "HTTP 5xx rate",
    severity: str = "critical",
    signal: str = "metrics",
    enabled: bool = True,
    condition: dict[str, Any] | None = None,
    evaluation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = alert_rule_payload(
        project_id=project_id,
        name=name,
        severity=severity,
        signal=signal,
        enabled=enabled,
    )
    if condition is not None:
        payload["condition"] = condition
    if evaluation is not None:
        payload["evaluation"] = evaluation
    response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json=payload,
    )
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def create_api_key(
    client: TestClient,
    *,
    project_id: int,
    auth_headers: dict[str, str],
) -> str:
    response = client.post(
        f"/api/v1/projects/{project_id}/api-keys",
        headers=auth_headers,
        json={"name": "alert-evaluation-ingest"},
    )
    assert response.status_code == 201
    return str(response.json()["api_key"])


def set_metric_records_occurred_at(
    client: TestClient,
    *,
    project_id: int,
    timestamps: list[datetime],
) -> None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = (
            session.query(IngestRecordModel)
            .filter(
                IngestRecordModel.project_id == project_id,
                IngestRecordModel.kind == "metric",
            )
            .order_by(IngestRecordModel.id)
            .all()
        )
        assert len(records) == len(timestamps)
        for record, timestamp in zip(records, timestamps, strict=True):
            record.occurred_at = timestamp
        session.commit()


def _json_request_headers(auth_headers: dict[str, str]) -> dict[str, str]:
    return {**auth_headers, "Content-Type": "application/json"}


def _json_content(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, allow_nan=True)


def _too_deep_alert_json() -> Any:
    value: Any = {}
    for _ in range(MAX_ALERT_RULE_JSON_DEPTH):
        value = {"nested": value}
    return value


def _too_complex_alert_json() -> dict[str, Any]:
    return {"items": [0] * MAX_ALERT_RULE_JSON_NODES}


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("GET", "/api/v1/alerts/rules", None),
        ("POST", "/api/v1/alerts/rules", {"project_id": 1, "name": "x"}),
        ("GET", "/api/v1/projects/1/alerts/rules/1", None),
        ("PATCH", "/api/v1/projects/1/alerts/rules/1", {"name": "x"}),
        ("DELETE", "/api/v1/projects/1/alerts/rules/1", None),
    ],
)
def test_alert_rule_api_rejects_missing_token(
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    client = build_client()

    response = client.request(method, path, json=json_body)

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"
    assert response.headers["www-authenticate"] == "Bearer"


def test_alert_rule_crud_success_path_with_pagination_filters_and_audit_fields() -> None:
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

    created = create_alert_rule(client, owner_headers, project_id=project_id)
    create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="Error logs",
        severity="warning",
        signal="logs",
    )
    create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="Slow traces",
        severity="critical",
        signal="traces",
        enabled=False,
    )

    assert created["id"] == 1
    assert created["project_id"] == project_id
    assert created["name"] == "HTTP 5xx rate"
    assert created["description"] == "5 分钟错误率过高"
    assert created["enabled"] is True
    assert created["severity"] == "critical"
    assert created["signal"] == "metrics"
    assert created["condition"]["metric"] == "http.server.errors"
    assert created["evaluation"] == {"window_seconds": 300, "interval_seconds": 60}
    assert created["created_by_user_id"] == owner.id
    assert created["updated_by_user_id"] == owner.id
    assert created["created_at"]
    assert created["updated_at"]

    list_response = client.get(
        "/api/v1/alerts/rules",
        headers=owner_headers,
        params={
            "project_id": project_id,
            "severity": "critical",
            "signal": "traces",
            "enabled": False,
            "limit": 1,
            "offset": 0,
        },
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 1
    assert listed["limit"] == 1
    assert listed["offset"] == 0
    assert listed["items"][0]["name"] == "Slow traces"

    get_response = client.get(
        f"/api/v1/projects/{project_id}/alerts/rules/{created['id']}",
        headers=owner_headers,
    )
    assert get_response.status_code == 200
    assert get_response.json() == created

    update_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{created['id']}",
        headers=editor_headers,
        json={
            "name": "HTTP 5xx burn rate",
            "description": None,
            "enabled": False,
            "severity": "warning",
            "signal": "logs",
            "condition": {"field": "level", "operator": "eq", "value": "error"},
            "evaluation": {"window_seconds": 600, "interval_seconds": 120},
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "HTTP 5xx burn rate"
    assert updated["description"] is None
    assert updated["enabled"] is False
    assert updated["severity"] == "warning"
    assert updated["signal"] == "logs"
    assert updated["condition"] == {"field": "level", "operator": "eq", "value": "error"}
    assert updated["evaluation"] == {"window_seconds": 600, "interval_seconds": 120}
    assert updated["created_by_user_id"] == owner.id
    assert updated["updated_by_user_id"] == editor.id

    delete_response = client.delete(
        f"/api/v1/projects/{project_id}/alerts/rules/{created['id']}",
        headers=editor_headers,
    )
    assert delete_response.status_code == 204
    assert delete_response.content == b""

    missing_response = client.get(
        f"/api/v1/projects/{project_id}/alerts/rules/{created['id']}",
        headers=owner_headers,
    )
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "告警规则不存在"


def test_alert_rule_permissions_hide_unscoped_projects_and_cross_project_ids() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    viewer, viewer_headers = create_auth_headers(client, username="viewer")
    editor, editor_headers = create_auth_headers(client, username="editor")
    _, stranger_headers = create_auth_headers(client, username="stranger")
    superuser, superuser_headers = create_auth_headers(
        client,
        username="superuser",
        is_superuser=True,
    )
    project_a = create_project(client, owner_headers, name="项目 A", key="project-a")
    project_b = create_project(client, owner_headers, name="项目 B", key="project-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=editor.id,
        role=ProjectRole.editor,
    )
    project_a_rule = create_alert_rule(client, owner_headers, project_id=project_a_id)
    project_b_rule = create_alert_rule(client, owner_headers, project_id=project_b_id)

    viewer_list_response = client.get(
        "/api/v1/alerts/rules",
        headers=viewer_headers,
        params={"project_id": project_a_id},
    )
    viewer_get_response = client.get(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{project_a_rule['id']}",
        headers=viewer_headers,
    )
    viewer_create_response = client.post(
        "/api/v1/alerts/rules",
        headers=viewer_headers,
        json=alert_rule_payload(project_id=project_a_id, name="Viewer cannot write"),
    )
    viewer_update_response = client.patch(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{project_a_rule['id']}",
        headers=viewer_headers,
        json={"enabled": False},
    )
    viewer_delete_response = client.delete(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{project_a_rule['id']}",
        headers=viewer_headers,
    )
    stranger_list_response = client.get(
        "/api/v1/alerts/rules",
        headers=stranger_headers,
        params={"project_id": project_a_id},
    )
    stranger_create_response = client.post(
        "/api/v1/alerts/rules",
        headers=stranger_headers,
        json=alert_rule_payload(project_id=project_a_id, name="Stranger cannot write"),
    )
    cross_project_response = client.get(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{project_b_rule['id']}",
        headers=owner_headers,
    )
    editor_create_response = client.post(
        "/api/v1/alerts/rules",
        headers=editor_headers,
        json=alert_rule_payload(project_id=project_a_id, name="Editor write"),
    )
    superuser_create_response = client.post(
        "/api/v1/alerts/rules",
        headers=superuser_headers,
        json=alert_rule_payload(project_id=project_b_id, name="Superuser write"),
    )

    assert viewer_list_response.status_code == 200
    assert [item["id"] for item in viewer_list_response.json()["items"]] == [project_a_rule["id"]]
    assert viewer_get_response.status_code == 200
    assert viewer_get_response.json()["id"] == project_a_rule["id"]
    assert viewer_create_response.status_code == 403
    assert viewer_create_response.json()["detail"] == "无项目权限"
    assert viewer_update_response.status_code == 403
    assert viewer_update_response.json()["detail"] == "无项目权限"
    assert viewer_delete_response.status_code == 403
    assert viewer_delete_response.json()["detail"] == "无项目权限"
    assert stranger_list_response.status_code == 404
    assert stranger_list_response.json()["detail"] == "项目不存在"
    assert stranger_create_response.status_code == 404
    assert stranger_create_response.json()["detail"] == "项目不存在"
    assert cross_project_response.status_code == 404
    assert cross_project_response.json()["detail"] == "告警规则不存在"
    assert editor_create_response.status_code == 201
    assert editor_create_response.json()["created_by_user_id"] == editor.id
    assert superuser_create_response.status_code == 201
    assert superuser_create_response.json()["created_by_user_id"] == superuser.id


def test_alert_rule_global_list_is_filtered_to_accessible_projects() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="owner")
    viewer, viewer_headers = create_auth_headers(client, username="viewer")
    _, stranger_headers = create_auth_headers(client, username="stranger")
    project_a = create_project(client, owner_headers, name="项目 A", key="list-project-a")
    project_b = create_project(client, owner_headers, name="项目 B", key="list-project-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    project_a_rule = create_alert_rule(client, owner_headers, project_id=project_a_id)
    create_alert_rule(client, owner_headers, project_id=project_b_id, name="Hidden")

    viewer_response = client.get("/api/v1/alerts/rules", headers=viewer_headers)
    stranger_response = client.get("/api/v1/alerts/rules", headers=stranger_headers)

    assert viewer_response.status_code == 200
    assert viewer_response.json()["total"] == 1
    assert [item["id"] for item in viewer_response.json()["items"]] == [project_a_rule["id"]]
    assert stranger_response.status_code == 200
    assert stranger_response.json() == {"items": [], "limit": 50, "offset": 0, "total": 0}


def test_alert_rule_manual_evaluation_returns_firing_ok_no_data_and_disabled() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="evaluation-owner")
    project = create_project(client, owner_headers, name="评估项目", key="evaluation-project")
    project_id = cast(int, project["id"])
    raw_key = create_api_key(client, project_id=project_id, auth_headers=owner_headers)
    now = datetime.now(UTC)

    ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "http.server.errors",
                    "value": 2,
                    "source": "api",
                    "unit": "count",
                },
                {
                    "name": "http.server.errors",
                    "value": 3,
                    "source": "api",
                    "unit": "count",
                },
                {
                    "name": "http.server.errors",
                    "value": 100,
                    "source": "worker",
                    "unit": "count",
                },
                {
                    "name": "http.server.latency",
                    "value": 100,
                    "source": "api",
                    "unit": "ms",
                },
                {
                    "name": "http.server.errors",
                    "value": 100,
                    "source": "api",
                    "unit": "count",
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_metric_records_occurred_at(
        client,
        project_id=project_id,
        timestamps=[
            now - timedelta(seconds=60),
            now - timedelta(seconds=30),
            now - timedelta(seconds=30),
            now - timedelta(seconds=30),
            now - timedelta(seconds=600),
        ],
    )

    firing_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="错误数 firing",
        condition={
            "metric": " http.server.errors ",
            "source": " api ",
            "operator": "gt",
            "threshold": 4,
            "aggregation": "sum",
        },
    )
    ok_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="错误数 ok",
        condition={
            "metric": "http.server.errors",
            "source": "api",
            "operator": "lt",
            "threshold": 4,
            "aggregation": "sum",
        },
    )
    no_data_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="无数据",
        condition={
            "metric": "missing.metric",
            "operator": "gt",
            "threshold": 1,
            "aggregation": "avg",
        },
    )
    disabled_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name="禁用规则",
        enabled=False,
        condition={
            "metric": "http.server.errors",
            "source": "api",
            "operator": "gt",
            "threshold": 1,
            "aggregation": "sum",
        },
    )

    firing_response = client.post(
        f"/api/v1/projects/{project_id}/alerts/rules/{firing_rule['id']}/evaluate",
        headers=owner_headers,
    )
    ok_response = client.post(
        f"/api/v1/projects/{project_id}/alerts/rules/{ok_rule['id']}/evaluate",
        headers=owner_headers,
    )
    no_data_response = client.post(
        f"/api/v1/projects/{project_id}/alerts/rules/{no_data_rule['id']}/evaluate",
        headers=owner_headers,
    )
    disabled_response = client.post(
        f"/api/v1/projects/{project_id}/alerts/rules/{disabled_rule['id']}/evaluate",
        headers=owner_headers,
    )

    assert firing_response.status_code == 200
    firing_body = firing_response.json()
    assert firing_body["project_id"] == project_id
    assert firing_body["rule_id"] == firing_rule["id"]
    assert firing_body["status"] == "firing"
    assert firing_body["signal"] == "metrics"
    assert firing_body["severity"] == "critical"
    assert firing_body["condition"] == {
        "metric": "http.server.errors",
        "source": "api",
        "operator": "gt",
        "threshold": 4.0,
        "aggregation": "sum",
    }
    assert firing_body["window"]["window_seconds"] == 300
    assert firing_body["window"]["interval_seconds"] == 60
    assert firing_body["window"]["from"] <= firing_body["checked_at"] <= firing_body["window"]["to"]
    assert firing_body["observed"] == {
        "value": 5.0,
        "sample_count": 2,
        "aggregation": "sum",
        "unit": "count",
    }
    assert firing_body["message"] == "metric http.server.errors sum 5 > 4"

    assert ok_response.status_code == 200
    ok_body = ok_response.json()
    assert ok_body["status"] == "ok"
    assert ok_body["observed"]["value"] == 5.0
    assert ok_body["observed"]["sample_count"] == 2
    assert ok_body["message"] == "metric http.server.errors sum 5 not < 4"

    assert no_data_response.status_code == 200
    no_data_body = no_data_response.json()
    assert no_data_body["status"] == "no_data"
    assert no_data_body["condition"]["aggregation"] == "avg"
    assert no_data_body["observed"] is None

    assert disabled_response.status_code == 200
    disabled_body = disabled_response.json()
    assert disabled_body["status"] == "disabled"
    assert disabled_body["observed"] is None


def test_alert_rule_manual_evaluation_validation_and_permissions() -> None:
    client = build_client()
    _, owner_headers = create_auth_headers(client, username="evaluation-permission-owner")
    viewer, viewer_headers = create_auth_headers(client, username="evaluation-viewer")
    _, stranger_headers = create_auth_headers(client, username="evaluation-stranger")
    project_a = create_project(client, owner_headers, name="评估权限 A", key="evaluation-perm-a")
    project_b = create_project(client, owner_headers, name="评估权限 B", key="evaluation-perm-b")
    project_a_id = cast(int, project_a["id"])
    project_b_id = cast(int, project_b["id"])
    grant_project_role(
        client,
        project_id=project_a_id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    metrics_rule = create_alert_rule(client, owner_headers, project_id=project_a_id)
    logs_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_a_id,
        name="日志规则",
        signal="logs",
    )
    invalid_condition_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_a_id,
        name="非法条件",
        condition={
            "metric": "http.server.errors",
            "operator": "gt",
            "threshold": "3",
        },
    )
    project_b_rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_b_id,
        name="项目 B 规则",
    )

    viewer_evaluate_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{metrics_rule['id']}/evaluate",
        headers=viewer_headers,
    )
    viewer_write_response = client.patch(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{metrics_rule['id']}",
        headers=viewer_headers,
        json={"enabled": False},
    )
    logs_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{logs_rule['id']}/evaluate",
        headers=owner_headers,
    )
    invalid_condition_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{invalid_condition_rule['id']}/evaluate",
        headers=owner_headers,
    )
    stranger_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{metrics_rule['id']}/evaluate",
        headers=stranger_headers,
    )
    cross_project_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/{project_b_rule['id']}/evaluate",
        headers=owner_headers,
    )
    missing_rule_response = client.post(
        f"/api/v1/projects/{project_a_id}/alerts/rules/999999/evaluate",
        headers=owner_headers,
    )

    assert viewer_evaluate_response.status_code == 200
    assert viewer_evaluate_response.json()["status"] == "no_data"
    assert viewer_write_response.status_code == 403
    assert viewer_write_response.json()["detail"] == "无项目权限"
    assert logs_response.status_code == 422
    assert logs_response.json()["detail"] == "仅支持 metrics 告警规则评估"
    assert invalid_condition_response.status_code == 422
    assert invalid_condition_response.json()["detail"] == (
        "condition.threshold 必须是有限 JSON number"
    )
    assert stranger_response.status_code == 404
    assert stranger_response.json()["detail"] == "项目不存在"
    assert cross_project_response.status_code == 404
    assert cross_project_response.json()["detail"] == "告警规则不存在"
    assert missing_rule_response.status_code == 404
    assert missing_rule_response.json()["detail"] == "告警规则不存在"


@pytest.mark.parametrize(
    ("condition", "expected_detail"),
    [
        (
            {"operator": "gt", "threshold": 1},
            "condition.metric 为必填字段",
        ),
        (
            {"metric": "   ", "operator": "gt", "threshold": 1},
            "condition.metric 不能为空",
        ),
        (
            {"metric": "x" * 129, "operator": "gt", "threshold": 1},
            "condition.metric 不能超过 128 字符",
        ),
        (
            {"metric": "cpu.usage", "source": "   ", "operator": "gt", "threshold": 1},
            "condition.source 不能为空",
        ),
        (
            {"metric": "cpu.usage", "source": "x" * 129, "operator": "gt", "threshold": 1},
            "condition.source 不能超过 128 字符",
        ),
        (
            {"metric": "cpu.usage", "operator": "between", "threshold": 1},
            "condition.operator 必须是 gt/gte/lt/lte/eq/ne 之一",
        ),
        (
            {"metric": "cpu.usage", "operator": "gt", "threshold": True},
            "condition.threshold 必须是有限 JSON number",
        ),
        (
            {"metric": "cpu.usage", "operator": "gt", "threshold": "1"},
            "condition.threshold 必须是有限 JSON number",
        ),
        (
            {
                "metric": "cpu.usage",
                "operator": "gt",
                "threshold": 1,
                "aggregation": "median",
            },
            "condition.aggregation 必须是 avg/sum/min/max/count 之一",
        ),
        (
            {"metric": "cpu.usage", "operator": "gt", "threshold": 1, "aggregation": True},
            "condition.aggregation 必须是字符串",
        ),
    ],
)
def test_alert_rule_manual_evaluation_rejects_invalid_metric_condition(
    condition: dict[str, Any],
    expected_detail: str,
) -> None:
    client = build_client()
    case_key = f"condition-{len(expected_detail)}-{len(json.dumps(condition, sort_keys=True))}"
    _, owner_headers = create_auth_headers(
        client,
        username=case_key,
    )
    project = create_project(
        client,
        owner_headers,
        name=f"条件校验 {case_key}",
        key=case_key,
    )
    project_id = cast(int, project["id"])
    rule = create_alert_rule(
        client,
        owner_headers,
        project_id=project_id,
        name=f"非法条件 {case_key}",
        condition=condition,
    )

    response = client.post(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}/evaluate",
        headers=owner_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == expected_detail


def test_alert_rule_duplicate_name_returns_409() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    create_alert_rule(client, auth_headers, project_id=project_id)

    duplicate_response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json=alert_rule_payload(project_id=project_id),
    )

    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["detail"] == "同一项目下告警规则名称已存在"


def test_alert_rule_partial_update_omits_json_fields_and_accepts_description_null() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="partial-owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    rule = create_alert_rule(client, auth_headers, project_id=project_id)

    name_only_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}",
        headers=auth_headers,
        json={"name": "仅改名称"},
    )
    null_description_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}",
        headers=auth_headers,
        json={"description": None},
    )

    assert name_only_response.status_code == 200
    assert name_only_response.json()["condition"] == rule["condition"]
    assert name_only_response.json()["evaluation"] == rule["evaluation"]
    assert null_description_response.status_code == 200
    assert null_description_response.json()["description"] is None


def test_alert_rule_validation_errors_are_reported_as_422() -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username="owner")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    rule = create_alert_rule(client, auth_headers, project_id=project_id)

    invalid_severity_response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json=alert_rule_payload(project_id=project_id, severity="fatal"),
    )
    invalid_signal_response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json=alert_rule_payload(project_id=project_id, signal="heartbeat"),
    )
    invalid_condition_response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json={
            **alert_rule_payload(project_id=project_id, name="Invalid condition"),
            "condition": [],
        },
    )
    missing_evaluation_response = client.post(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        json={
            **alert_rule_payload(project_id=project_id, name="Missing evaluation"),
            "evaluation": {"window_seconds": 60},
        },
    )
    empty_patch_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}",
        headers=auth_headers,
        json={},
    )
    null_condition_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}",
        headers=auth_headers,
        json={"condition": None},
    )
    invalid_limit_response = client.get(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        params={"limit": 101},
    )
    invalid_filter_response = client.get(
        "/api/v1/alerts/rules",
        headers=auth_headers,
        params={"severity": "fatal"},
    )

    assert invalid_severity_response.status_code == 422
    assert invalid_signal_response.status_code == 422
    assert invalid_condition_response.status_code == 422
    assert invalid_condition_response.json()["detail"][0]["loc"][-1] == "condition"
    assert missing_evaluation_response.status_code == 422
    assert missing_evaluation_response.json()["detail"][0]["loc"][-1] == "evaluation"
    assert empty_patch_response.status_code == 422
    assert null_condition_response.status_code == 422
    assert invalid_limit_response.status_code == 422
    assert invalid_filter_response.status_code == 422


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("condition", {}),
        ("evaluation", {}),
        ("condition", {"blob": "x" * (MAX_ALERT_RULE_JSON_BYTES + 1)}),
        ("condition", _too_deep_alert_json()),
        ("condition", _too_complex_alert_json()),
        ("condition", {"bad": float("nan")}),
        ("evaluation", {"window_seconds": 0, "interval_seconds": 60}),
        ("evaluation", {"window_seconds": 60, "interval_seconds": 86_401}),
        ("evaluation", {"window_seconds": True, "interval_seconds": 60}),
        ("evaluation", {"window_seconds": 60.5, "interval_seconds": 60}),
    ],
)
def test_alert_rule_json_payload_limits_are_reported_as_422_for_create_and_update(
    field_name: str,
    invalid_value: Any,
) -> None:
    client = build_client()
    _, auth_headers = create_auth_headers(client, username=f"owner-{field_name}")
    project = create_project(client, auth_headers)
    project_id = cast(int, project["id"])
    rule = create_alert_rule(client, auth_headers, project_id=project_id)
    headers = _json_request_headers(auth_headers)

    create_body = {
        **alert_rule_payload(project_id=project_id, name=f"非法 {field_name}"),
        field_name: invalid_value,
    }
    create_response = client.post(
        "/api/v1/alerts/rules",
        headers=headers,
        content=_json_content(create_body),
    )
    update_response = client.patch(
        f"/api/v1/projects/{project_id}/alerts/rules/{rule['id']}",
        headers=headers,
        content=_json_content({field_name: invalid_value}),
    )

    assert create_response.status_code == 422
    assert any(field_name in error["loc"] for error in create_response.json()["detail"])
    assert update_response.status_code == 422
    assert any(field_name in error["loc"] for error in update_response.json()["detail"])


def test_alert_rule_repository_maps_missing_project_and_duplicate_name() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        owner = SqlAlchemyAuthRepository(session).create_user(
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
        repository = SqlAlchemyAlertRuleRepository(session)

        repository.create_alert_rule(
            project_id=project.id,
            name="HTTP 5xx rate",
            description=None,
            enabled=True,
            severity=AlertRuleSeverity.critical,
            signal=AlertRuleSignal.metrics,
            condition={"metric": "http.server.errors"},
            evaluation={"window_seconds": 300, "interval_seconds": 60},
            created_by_user_id=owner.id,
        )
        with pytest.raises(DuplicateResourceError, match="同一项目下告警规则名称已存在"):
            repository.create_alert_rule(
                project_id=project.id,
                name="HTTP 5xx rate",
                description=None,
                enabled=True,
                severity=AlertRuleSeverity.warning,
                signal=AlertRuleSignal.logs,
                condition={"field": "level"},
                evaluation={"window_seconds": 300, "interval_seconds": 60},
                created_by_user_id=owner.id,
            )
        with pytest.raises(ResourceNotFoundError, match="项目不存在"):
            repository.create_alert_rule(
                project_id=999,
                name="孤立规则",
                description=None,
                enabled=True,
                severity=AlertRuleSeverity.warning,
                signal=AlertRuleSignal.metrics,
                condition={"metric": "http.server.errors"},
                evaluation={"window_seconds": 300, "interval_seconds": 60},
                created_by_user_id=owner.id,
            )


def test_alert_rule_repository_persists_json_and_deletes_record() -> None:
    client = build_client()
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        owner = SqlAlchemyAuthRepository(session).create_user(
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
        repository = SqlAlchemyAlertRuleRepository(session)
        rule = repository.create_alert_rule(
            project_id=project.id,
            name="HTTP 5xx rate",
            description=None,
            enabled=True,
            severity=AlertRuleSeverity.critical,
            signal=AlertRuleSignal.metrics,
            condition={"metric": "http.server.errors", "threshold": 3},
            evaluation={"window_seconds": 300, "interval_seconds": 60},
            created_by_user_id=owner.id,
        )

        assert rule.condition == {"metric": "http.server.errors", "threshold": 3}
        assert rule.evaluation == {"window_seconds": 300, "interval_seconds": 60}
        assert repository.delete_alert_rule(rule.id)
        assert repository.get_project_alert_rule(project_id=project.id, rule_id=rule.id) is None


def test_alert_rule_migration_sqlite_upgrade_and_downgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "alert-rules-migration.db"
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
        assert "alert_rules" in inspector.get_table_names()
        columns = {column["name"] for column in inspector.get_columns("alert_rules")}
        assert {
            "id",
            "project_id",
            "name",
            "description",
            "enabled",
            "severity",
            "signal",
            "condition",
            "evaluation",
            "created_by_user_id",
            "updated_by_user_id",
            "created_at",
            "updated_at",
        } <= columns
        indexes = {index["name"] for index in inspector.get_indexes("alert_rules")}
        assert "ix_alert_rules_project_updated_at_id" in indexes
        unique_constraints = {
            constraint["name"] for constraint in inspector.get_unique_constraints("alert_rules")
        }
        assert "uq_alert_rules_project_name" in unique_constraints
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
        assert "alert_rules" not in inspect(app.state.db_engine).get_table_names()
    finally:
        app.state.db_engine.dispose()


def test_alert_rule_model_mysql_ddl_uses_json_columns_and_utf8mb4() -> None:
    table = cast(Table, AlertRuleModel.__table__)
    compiled = str(CreateTable(table).compile(dialect=mysql.dialect()))

    assert "CREATE TABLE alert_rules" in compiled
    assert "`condition` JSON NOT NULL" in compiled
    assert "evaluation JSON NOT NULL" in compiled
    assert "UNIQUE (project_id, name)" in compiled
    assert "CHARSET=utf8mb4" in compiled
