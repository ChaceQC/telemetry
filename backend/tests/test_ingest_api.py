from argparse import Namespace
from pathlib import Path
from typing import Any, cast

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Table, inspect, select
from sqlalchemy.dialects import mysql, sqlite
from sqlalchemy.dialects.mysql import mariadb
from sqlalchemy.schema import CreateTable

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.ingest import IngestRecordModel
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.services.auth import AuthService, hash_password
from app.services.rate_limit import RateLimiterUnavailableError

TEST_AUTH_SECRET = "test-auth-secret-key-with-at-least-thirty-two-bytes"
BACKEND_ROOT = Path(__file__).resolve().parents[1]
INGEST_RECORD_QUERY_INDEX_NAME = "ix_ingest_records_project_kind_received_at_id"
INGEST_RECORD_QUERY_INDEX_COLUMNS = ["project_id", "kind", "received_at", "id"]


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


def build_rate_limited_client(*, limit_per_minute: int) -> TestClient:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        database_url="sqlite:///:memory:",
        auth_secret_key=TEST_AUTH_SECRET,
        ingest_rate_limit_enabled=True,
        ingest_rate_limit_per_minute=limit_per_minute,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.db_engine)
    return TestClient(app)


def _tested_app(client: TestClient) -> FastAPI:
    return cast(FastAPI, client.app)


class FailingRateLimiter:
    def check(self, *, key: str, now: float | None = None) -> None:
        raise RateLimiterUnavailableError("摄入限流服务不可用")


def create_test_user(client: TestClient, *, username: str) -> UserRecord:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        return SqlAlchemyAuthRepository(session).create_user(
            username=username,
            email=f"{username}@example.test",
            password_hash=hash_password("correct-password"),
            display_name=username,
        )


def create_auth_headers(client: TestClient, *, username: str) -> dict[str, str]:
    user = create_test_user(client, username=username)
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        token, _ = AuthService(
            SqlAlchemyAuthRepository(session),
            app.state.settings,
        ).create_access_token(user)
    return {"Authorization": f"Bearer {token}"}


def create_project(client: TestClient, auth_headers: dict[str, str], key: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={"name": key, "key": key},
    )
    assert response.status_code == 201
    return cast(dict[str, object], response.json())


def create_api_key(client: TestClient, project_id: object, auth_headers: dict[str, str]) -> str:
    response = client.post(
        f"/api/v1/projects/{project_id}/api-keys",
        headers=auth_headers,
        json={"name": "摄入 key"},
    )
    assert response.status_code == 201
    return cast(str, response.json()["api_key"])


def create_ingest_api_key(
    client: TestClient,
    *,
    username: str,
    project_key: str,
) -> tuple[dict[str, object], str, dict[str, str]]:
    admin_headers = create_auth_headers(client, username=username)
    project = create_project(client, admin_headers, project_key)
    raw_key = create_api_key(client, project["id"], admin_headers)
    return project, raw_key, admin_headers


def metric_payload() -> dict[str, Any]:
    return {
        "metrics": [
            {
                "name": "http.server.duration",
                "value": 12.5,
                "unit": "ms",
                "type": "histogram",
                "source": "api",
                "tags": {"route": "/health"},
                "payload": {"bucket": "p95"},
            }
        ]
    }


def log_payload() -> dict[str, Any]:
    return {
        "logs": [
            {
                "level": "info",
                "message": "deployment finished",
                "logger": "deploy.worker",
                "source": "worker",
                "trace_id": "trace-1",
                "span_id": "span-1",
                "attributes": {"service": "api"},
                "payload": {"duration_ms": 42},
            }
        ]
    }


def trace_span_payload(**overrides: Any) -> dict[str, Any]:
    span = {
        "trace_id": "trace-1",
        "span_id": "span-1",
        "parent_span_id": "root-span",
        "name": "GET /health",
        "start_time": "2026-06-21T00:00:00Z",
        "end_time": "2026-06-21T00:00:00.125Z",
        "status_code": "ok",
        "source": "api",
        "attributes": {"service.name": "backend"},
        "payload": {"http.method": "GET"},
    }
    span.update(overrides)
    return span


def trace_payload() -> dict[str, Any]:
    return {"spans": [trace_span_payload()]}


def test_ingest_event_accepts_bearer_api_key_and_binds_project() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers, "core-platform")
    raw_key = create_api_key(client, project["id"], admin_headers)

    response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "type": "deployment",
            "source": "ci",
            "payload": {"version": "1.2.3", "status": "ok"},
        },
    )

    assert response.status_code == 202
    receipt = response.json()
    assert receipt["project_id"] == project["id"]
    assert receipt["kind"] == "event"
    assert receipt["type"] == "deployment"

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        record = session.scalar(select(IngestRecordModel))

    assert record is not None
    assert record.project_id == project["id"]
    assert record.event_type == "deployment"
    assert record.payload == {"version": "1.2.3", "status": "ok"}


def test_ingest_batch_accepts_x_api_key_header() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers, "batch-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    response = client.post(
        "/api/v1/ingest/batch",
        headers={"X-API-Key": raw_key},
        json={
            "events": [
                {"type": "deploy.started", "payload": {"id": "d-1"}},
                {"type": "deploy.finished", "payload": {"id": "d-1", "ok": True}},
            ]
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted_count"] == 2
    assert [receipt["project_id"] for receipt in body["receipts"]] == [
        project["id"],
        project["id"],
    ]


def test_ingest_stats_are_recorded_and_listed_for_project_member() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-admin",
        project_key="stats-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/batch",
        headers={"X-API-Key": raw_key},
        json={
            "events": [
                {
                    "type": "deploy.started",
                    "source": "ci",
                    "timestamp": "2026-06-20T10:23:15Z",
                    "payload": {"id": "d-1"},
                },
                {
                    "type": "deploy.finished",
                    "source": "ci",
                    "timestamp": "2026-06-20T10:23:45Z",
                    "payload": {"id": "d-1", "ok": True},
                },
            ]
        },
    )
    stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert ingest_response.status_code == 202
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert len(stats) == 1
    assert stats[0]["project_id"] == project["id"]
    assert stats[0]["kind"] == "event"
    assert stats[0]["source"] == "ci"
    assert stats[0]["accepted_count"] == 2
    assert stats[0]["rejected_count"] == 0
    assert stats[0]["bytes_count"] > 0
    assert stats[0]["bucket_start"].startswith("2026-06-20T10:23:00")


def test_ingest_stats_record_rejected_validation_after_api_key_verification() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-rejected-validation",
        project_key="stats-rejected-validation-project",
    )

    rejected_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "bad type", "payload": {}},
    )
    stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert rejected_response.status_code == 422
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert len(stats) == 1
    assert stats[0]["accepted_count"] == 0
    assert stats[0]["rejected_count"] == 1
    assert stats[0]["bytes_count"] == 0


def test_ingest_stats_record_trace_rejected_validation_after_api_key_verification() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-rejected-trace-validation",
        project_key="stats-rejected-trace-validation-project",
    )

    rejected_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(trace_id="")]},
    )
    trace_stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "trace"},
    )
    event_stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert rejected_response.status_code == 422
    assert trace_stats_response.status_code == 200
    trace_stats = trace_stats_response.json()
    assert len(trace_stats) == 1
    assert trace_stats[0]["accepted_count"] == 0
    assert trace_stats[0]["rejected_count"] == 1
    assert trace_stats[0]["bytes_count"] == 0
    assert event_stats_response.status_code == 200
    assert event_stats_response.json() == []


def test_ingest_stats_record_rejected_rate_limit_after_api_key_verification() -> None:
    client = build_rate_limited_client(limit_per_minute=1)
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-rejected-rate",
        project_key="stats-rejected-rate-project",
    )

    accepted_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 1}},
    )
    rejected_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 2}},
    )
    stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert accepted_response.status_code == 202
    assert rejected_response.status_code == 429
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert len(stats) == 1
    assert stats[0]["accepted_count"] == 1
    assert stats[0]["rejected_count"] == 1
    assert stats[0]["bytes_count"] > 0


def test_ingest_stats_record_trace_rejected_rate_limit_after_api_key_verification() -> None:
    client = build_rate_limited_client(limit_per_minute=1)
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-rejected-trace-rate",
        project_key="stats-rejected-trace-rate-project",
    )

    accepted_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json=trace_payload(),
    )
    rejected_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json=trace_payload(),
    )
    trace_stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "trace"},
    )
    event_stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert accepted_response.status_code == 202
    assert rejected_response.status_code == 429
    assert trace_stats_response.status_code == 200
    trace_stats = trace_stats_response.json()
    assert sum(stat["accepted_count"] for stat in trace_stats) == 1
    assert sum(stat["rejected_count"] for stat in trace_stats) == 1
    assert sum(stat["bytes_count"] for stat in trace_stats) > 0
    assert event_stats_response.status_code == 200
    assert event_stats_response.json() == []


def test_ingest_stats_do_not_record_rejected_without_valid_api_key() -> None:
    client = build_client()
    project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="stats-invalid-key",
        project_key="stats-invalid-key-project",
    )

    invalid_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": "Bearer invalid"},
        json={"type": "deployment", "payload": {"attempt": 1}},
    )
    stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": project["id"], "kind": "event"},
    )

    assert invalid_response.status_code == 401
    assert stats_response.status_code == 200
    assert stats_response.json() == []


def test_ingest_stats_hide_projects_without_membership() -> None:
    client = build_client()
    project, raw_key, _ = create_ingest_api_key(
        client,
        username="stats-owner",
        project_key="stats-owner-project",
    )
    other_headers = create_auth_headers(client, username="stats-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"status": "ok"}},
    )
    all_stats_response = client.get("/api/v1/ingest/stats", headers=other_headers)
    project_stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=other_headers,
        params={"project_id": project["id"]},
    )

    assert ingest_response.status_code == 202
    assert all_stats_response.status_code == 200
    assert all_stats_response.json() == []
    assert project_stats_response.status_code == 404
    assert project_stats_response.json()["detail"] == "项目不存在"


def test_ingest_metrics_accepts_datapoints_and_binds_project() -> None:
    client = build_client()
    first_project, raw_key, _ = create_ingest_api_key(
        client,
        username="metrics-admin",
        project_key="metrics-project",
    )
    second_headers = create_auth_headers(client, username="metrics-other")
    second_project = create_project(client, second_headers, "metrics-other-project")

    response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "http.server.duration",
                    "value": 12.5,
                    "unit": "ms",
                    "type": "histogram",
                    "source": "api",
                    "tags": {
                        "route": "/health",
                        "project_id": second_project["id"],
                    },
                    "payload": {"bucket": "p95"},
                },
                {
                    "name": "jobs.completed",
                    "value": 2,
                    "source": "worker",
                    "payload": {"project_id": second_project["id"]},
                },
            ]
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted_count"] == 2
    assert [receipt["project_id"] for receipt in body["receipts"]] == [
        first_project["id"],
        first_project["id"],
    ]
    assert [receipt["kind"] for receipt in body["receipts"]] == ["metric", "metric"]
    assert [receipt["type"] for receipt in body["receipts"]] == [
        "http.server.duration",
        "jobs.completed",
    ]

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = list(session.scalars(select(IngestRecordModel).order_by(IngestRecordModel.id)))

    assert len(records) == 2
    assert {record.project_id for record in records} == {first_project["id"]}
    assert [record.kind for record in records] == ["metric", "metric"]
    assert records[0].event_type == "http.server.duration"
    assert records[0].payload["value"] == 12.5
    assert records[0].payload["tags"]["project_id"] == second_project["id"]
    assert records[1].payload["payload"]["project_id"] == second_project["id"]


def test_ingest_logs_accepts_records_and_binds_project() -> None:
    client = build_client()
    first_project, raw_key, _ = create_ingest_api_key(
        client,
        username="logs-admin",
        project_key="logs-project",
    )
    second_headers = create_auth_headers(client, username="logs-other")
    second_project = create_project(client, second_headers, "logs-other-project")

    response = client.post(
        "/api/v1/ingest/logs",
        headers={"X-API-Key": raw_key},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "deployment finished",
                    "logger": "deploy.worker",
                    "source": "worker",
                    "trace_id": "trace-1",
                    "span_id": "span-1",
                    "attributes": {
                        "service": "api",
                        "project_id": second_project["id"],
                    },
                    "payload": {"duration_ms": 42},
                },
                {
                    "level": "error",
                    "message": "retry failed",
                    "payload": {"project_id": second_project["id"]},
                },
            ]
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted_count"] == 2
    assert [receipt["project_id"] for receipt in body["receipts"]] == [
        first_project["id"],
        first_project["id"],
    ]
    assert [receipt["kind"] for receipt in body["receipts"]] == ["log", "log"]
    assert [receipt["type"] for receipt in body["receipts"]] == ["info", "error"]

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = list(session.scalars(select(IngestRecordModel).order_by(IngestRecordModel.id)))

    assert len(records) == 2
    assert {record.project_id for record in records} == {first_project["id"]}
    assert [record.kind for record in records] == ["log", "log"]
    assert records[0].event_type == "info"
    assert records[0].payload["message"] == "deployment finished"
    assert records[0].payload["attributes"]["project_id"] == second_project["id"]
    assert records[1].payload["payload"]["project_id"] == second_project["id"]


def test_ingest_traces_accepts_spans_and_binds_project() -> None:
    client = build_client()
    first_project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="traces-admin",
        project_key="traces-project",
    )
    second_headers = create_auth_headers(client, username="traces-other")
    second_project = create_project(client, second_headers, "traces-other-project")

    response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                trace_span_payload(payload={"project_id": second_project["id"]}),
                trace_span_payload(
                    span_id="span-2",
                    parent_span_id="span-1",
                    name="SELECT users",
                    duration_ms=42.5,
                    payload={"db.system": "mysql"},
                ),
            ]
        },
    )
    stats_response = client.get(
        "/api/v1/ingest/stats",
        headers=admin_headers,
        params={"project_id": first_project["id"], "kind": "trace"},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted_count"] == 2
    assert [receipt["project_id"] for receipt in body["receipts"]] == [
        first_project["id"],
        first_project["id"],
    ]
    assert [receipt["kind"] for receipt in body["receipts"]] == ["trace", "trace"]
    assert [receipt["type"] for receipt in body["receipts"]] == [
        "GET /health",
        "SELECT users",
    ]

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = list(session.scalars(select(IngestRecordModel).order_by(IngestRecordModel.id)))

    assert len(records) == 2
    assert {record.project_id for record in records} == {first_project["id"]}
    assert [record.kind for record in records] == ["trace", "trace"]
    assert records[0].event_type == "GET /health"
    assert records[0].payload["trace_id"] == "trace-1"
    assert records[0].payload["span_id"] == "span-1"
    assert records[0].payload["duration_ms"] == pytest.approx(125)
    assert records[0].payload["payload"]["project_id"] == second_project["id"]
    assert records[0].payload["raw"]["payload"]["project_id"] == second_project["id"]
    assert records[1].payload["parent_span_id"] == "span-1"
    assert records[1].payload["duration_ms"] == 42.5

    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert len(stats) == 1
    assert stats[0]["project_id"] == first_project["id"]
    assert stats[0]["kind"] == "trace"
    assert stats[0]["source"] == "api"
    assert stats[0]["accepted_count"] == 2
    assert stats[0]["rejected_count"] == 0
    assert stats[0]["bytes_count"] > 0


def test_ingest_rejects_missing_invalid_and_revoked_api_key() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers, "revoked-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    missing_response = client.post(
        "/api/v1/ingest/events",
        json={"type": "deployment", "payload": {}},
    )
    invalid_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": "Bearer tlm_invalid"},
        json={"type": "deployment", "payload": {}},
    )

    api_keys_response = client.get(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=admin_headers,
    )
    api_key_id = api_keys_response.json()[0]["id"]
    revoke_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/{api_key_id}/revoke",
        headers=admin_headers,
    )
    revoked_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {}},
    )

    assert missing_response.status_code == 401
    assert missing_response.json()["detail"] == "缺少 API Key"
    assert invalid_response.status_code == 401
    assert invalid_response.json()["detail"] == "API Key 无效或已撤销"
    assert revoke_response.status_code == 200
    assert revoked_response.status_code == 401
    assert revoked_response.json()["detail"] == "API Key 无效或已撤销"


def test_ingest_rate_limit_rejects_requests_after_window_limit() -> None:
    client = build_rate_limited_client(limit_per_minute=2)
    admin_headers = create_auth_headers(client, username="limited")
    project = create_project(client, admin_headers, "limited-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    first_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 1}},
    )
    second_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 2}},
    )
    limited_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 3}},
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    assert limited_response.status_code == 429
    assert limited_response.json()["detail"] == "摄入请求过于频繁"
    assert limited_response.headers["retry-after"] == "60"


def test_ingest_rate_limit_unavailable_returns_service_unavailable() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="limit-unavailable")
    project = create_project(client, admin_headers, "limit-unavailable-project")
    raw_key = create_api_key(client, project["id"], admin_headers)
    _tested_app(client).state.ingest_rate_limiter = FailingRateLimiter()

    response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"attempt": 1}},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "摄入限流服务不可用"


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/api/v1/ingest/metrics", metric_payload()),
        ("/api/v1/ingest/logs", log_payload()),
        ("/api/v1/ingest/traces", trace_payload()),
    ],
)
def test_ingest_metrics_and_logs_reject_missing_invalid_and_revoked_api_key(
    path: str,
    payload: dict[str, Any],
) -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username=f"auth-{path.rsplit('/', maxsplit=1)[-1]}",
        project_key=f"auth-{path.rsplit('/', maxsplit=1)[-1]}-project",
    )

    missing_response = client.post(path, json=payload)
    invalid_response = client.post(
        path,
        headers={"Authorization": "Bearer tlm_invalid"},
        json=payload,
    )

    api_keys_response = client.get(
        f"/api/v1/projects/{project['id']}/api-keys",
        headers=admin_headers,
    )
    api_key_id = api_keys_response.json()[0]["id"]
    revoke_response = client.post(
        f"/api/v1/projects/{project['id']}/api-keys/{api_key_id}/revoke",
        headers=admin_headers,
    )
    revoked_response = client.post(
        path,
        headers={"Authorization": f"Bearer {raw_key}"},
        json=payload,
    )

    assert missing_response.status_code == 401
    assert missing_response.json()["detail"] == "缺少 API Key"
    assert invalid_response.status_code == 401
    assert invalid_response.json()["detail"] == "API Key 无效或已撤销"
    assert revoke_response.status_code == 200
    assert revoked_response.status_code == 401
    assert revoked_response.json()["detail"] == "API Key 无效或已撤销"


def test_ingest_rejects_invalid_payload_and_client_project_id() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="admin")
    project = create_project(client, admin_headers, "validation-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    invalid_type_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "bad type", "payload": {}},
    )
    oversized_payload_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"blob": "x" * (64 * 1024)}},
    )
    project_override_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"project_id": 999, "type": "deployment", "payload": {}},
    )
    missing_payload_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment"},
    )

    assert invalid_type_response.status_code == 422
    assert oversized_payload_response.status_code == 422
    assert project_override_response.status_code == 422
    assert missing_payload_response.status_code == 422


def test_ingest_metrics_rejects_invalid_payload_and_client_project_id() -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username="metrics-validation",
        project_key="metrics-validation-project",
    )

    invalid_name_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "bad name", "value": 1}]},
    )
    missing_value_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "cpu.usage"}]},
    )
    string_value_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "cpu.usage", "value": "12.5"}]},
    )
    bool_value_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "cpu.usage", "value": True}]},
    )
    too_many_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": f"metric.{index}", "value": index} for index in range(101)]},
    )
    oversized_payload_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "cpu.usage",
                    "value": 1,
                    "payload": {"blob": "x" * (256 * 1024)},
                }
            ]
        },
    )
    project_override_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"project_id": 999, **metric_payload()},
    )

    assert invalid_name_response.status_code == 422
    assert missing_value_response.status_code == 422
    assert string_value_response.status_code == 422
    assert bool_value_response.status_code == 422
    assert too_many_response.status_code == 422
    assert oversized_payload_response.status_code == 422
    assert project_override_response.status_code == 422


def test_ingest_logs_rejects_invalid_payload_and_client_project_id() -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username="logs-validation",
        project_key="logs-validation-project",
    )

    invalid_level_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "bad level", "message": "hello"}]},
    )
    missing_message_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info"}]},
    )
    long_message_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info", "message": "x" * (8 * 1024 + 1)}]},
    )
    too_many_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info", "message": str(index)} for index in range(101)]},
    )
    oversized_payload_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "hello",
                    "payload": {"blob": "x" * (256 * 1024)},
                }
            ]
        },
    )
    project_override_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"project_id": 999, **log_payload()},
    )

    assert invalid_level_response.status_code == 422
    assert missing_message_response.status_code == 422
    assert long_message_response.status_code == 422
    assert too_many_response.status_code == 422
    assert oversized_payload_response.status_code == 422
    assert project_override_response.status_code == 422


def test_ingest_traces_rejects_invalid_payload_and_client_project_id() -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username="traces-validation",
        project_key="traces-validation-project",
    )

    missing_trace_id_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(trace_id="")]},
    )
    missing_start_time_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(start_time=None)]},
    )
    negative_duration_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(duration_ms=-1)]},
    )
    bool_duration_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(duration_ms=True)]},
    )
    inverted_time_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                trace_span_payload(
                    start_time="2026-06-21T00:00:01Z",
                    end_time="2026-06-21T00:00:00Z",
                )
            ]
        },
    )
    too_many_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                trace_span_payload(trace_id=f"trace-{index}", span_id=f"span-{index}")
                for index in range(101)
            ]
        },
    )
    oversized_payload_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"spans": [trace_span_payload(payload={"blob": "x" * (256 * 1024)})]},
    )
    project_override_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"project_id": 999, **trace_payload()},
    )

    assert missing_trace_id_response.status_code == 422
    assert missing_start_time_response.status_code == 422
    assert negative_duration_response.status_code == 422
    assert bool_duration_response.status_code == 422
    assert inverted_time_response.status_code == 422
    assert too_many_response.status_code == 422
    assert oversized_payload_response.status_code == 422
    assert project_override_response.status_code == 422


def test_ingest_rejects_non_finite_payload_values() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="nonfinite")
    project = create_project(client, admin_headers, "nonfinite-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    nan_response = client.post(
        "/api/v1/ingest/events",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "Content-Type": "application/json",
        },
        content='{"type":"deployment","payload":{"duration_ms":NaN}}',
    )
    infinity_response = client.post(
        "/api/v1/ingest/events",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "Content-Type": "application/json",
        },
        content='{"type":"deployment","payload":{"metrics":[1,Infinity]}}',
    )

    assert nan_response.status_code == 422
    assert infinity_response.status_code == 422


def test_ingest_batch_rejects_non_finite_payload_values() -> None:
    client = build_client()
    admin_headers = create_auth_headers(client, username="batch-nonfinite")
    project = create_project(client, admin_headers, "batch-nonfinite-project")
    raw_key = create_api_key(client, project["id"], admin_headers)

    response = client.post(
        "/api/v1/ingest/batch",
        headers={
            "X-API-Key": raw_key,
            "Content-Type": "application/json",
        },
        content=(
            '{"events":['
            '{"type":"deploy.started","payload":{"id":"d-1"}},'
            '{"type":"deploy.finished","payload":{"duration_ms":-Infinity}}'
            "]}"
        ),
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("body", "expected_status_code"),
    [
        ('{"metrics":[{"name":"cpu.usage","value":NaN}]}', 422),
        ('{"metrics":[{"name":"cpu.usage","value":Infinity}]}', 422),
        ('{"metrics":[{"name":"cpu.usage","value":1,"tags":{"bad":-Infinity}}]}', 422),
        ('{"metrics":[{"name":"cpu.usage","value":1,"payload":{"bad":NaN}}]}', 422),
    ],
)
def test_ingest_metrics_rejects_non_finite_values(
    body: str,
    expected_status_code: int,
) -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username=f"metrics-nonfinite-{abs(hash(body))}",
        project_key=f"metrics-nonfinite-{abs(hash(body))}",
    )

    response = client.post(
        "/api/v1/ingest/metrics",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "Content-Type": "application/json",
        },
        content=body,
    )

    assert response.status_code == expected_status_code


@pytest.mark.parametrize(
    "body",
    [
        '{"logs":[{"level":"info","message":"hello","attributes":{"bad":NaN}}]}',
        '{"logs":[{"level":"info","message":"hello","payload":{"bad":Infinity}}]}',
    ],
)
def test_ingest_logs_rejects_non_finite_values(body: str) -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username=f"logs-nonfinite-{abs(hash(body))}",
        project_key=f"logs-nonfinite-{abs(hash(body))}",
    )

    response = client.post(
        "/api/v1/ingest/logs",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "Content-Type": "application/json",
        },
        content=body,
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        '{"spans":[{"trace_id":"t","span_id":"s","name":"op","start_time":"2026-06-21T00:00:00Z","duration_ms":NaN}]}',
        '{"spans":[{"trace_id":"t","span_id":"s","name":"op","start_time":"2026-06-21T00:00:00Z","attributes":{"bad":Infinity}}]}',
        '{"spans":[{"trace_id":"t","span_id":"s","name":"op","start_time":"2026-06-21T00:00:00Z","payload":{"bad":-Infinity}}]}',
    ],
)
def test_ingest_traces_rejects_non_finite_values(body: str) -> None:
    client = build_client()
    _, raw_key, _ = create_ingest_api_key(
        client,
        username=f"traces-nonfinite-{abs(hash(body))}",
        project_key=f"traces-nonfinite-{abs(hash(body))}",
    )

    response = client.post(
        "/api/v1/ingest/traces",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "Content-Type": "application/json",
        },
        content=body,
    )

    assert response.status_code == 422


def test_ingest_cross_project_is_bound_to_api_key_project() -> None:
    client = build_client()
    first_headers = create_auth_headers(client, username="first")
    second_headers = create_auth_headers(client, username="second")
    first_project = create_project(client, first_headers, "first-project")
    second_project = create_project(client, second_headers, "second-project")
    raw_key = create_api_key(client, first_project["id"], first_headers)

    response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"project_id": second_project["id"]}},
    )

    assert response.status_code == 202
    assert response.json()["project_id"] == first_project["id"]

    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        record = session.scalar(select(IngestRecordModel))

    assert record is not None
    assert record.project_id == first_project["id"]
    assert record.project_id != second_project["id"]


def test_ingest_record_model_defines_query_window_index() -> None:
    table = cast(Table, IngestRecordModel.__table__)
    indexes = {
        str(index.name): [column.name for column in index.columns]
        for index in table.indexes
        if index.name is not None
    }

    assert indexes[INGEST_RECORD_QUERY_INDEX_NAME] == INGEST_RECORD_QUERY_INDEX_COLUMNS


def test_ingest_record_model_uses_mysql_microsecond_datetime() -> None:
    table = cast(Table, IngestRecordModel.__table__)
    mysql_dialect = mysql.dialect()
    mariadb_dialect = mariadb.MariaDBDialect()

    for dialect in (mysql_dialect, mariadb_dialect):
        assert table.c.occurred_at.type.compile(dialect=dialect) == "DATETIME(6)"
        assert table.c.received_at.type.compile(dialect=dialect) == "DATETIME(6)"


def test_ingest_record_model_received_at_default_matches_dialect() -> None:
    table = cast(Table, IngestRecordModel.__table__)
    mysql_sql = str(CreateTable(table).compile(dialect=mysql.dialect()))
    mariadb_sql = str(CreateTable(table).compile(dialect=mariadb.MariaDBDialect()))
    sqlite_sql = str(CreateTable(table).compile(dialect=sqlite.dialect()))

    assert "received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)" in mysql_sql
    assert "received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)" in mariadb_sql
    assert "received_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL" in sqlite_sql


def test_ingest_migration_sqlite_upgrade_and_downgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "ingest-migration.db"
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
        table_names = inspector.get_table_names()
        indexes = {
            index["name"]: index["column_names"]
            for index in inspector.get_indexes("ingest_records")
        }
        columns = {column["name"]: column for column in inspector.get_columns("ingest_records")}
        assert "ingest_records" in table_names
        assert "ingest_stats" in table_names
        assert indexes[INGEST_RECORD_QUERY_INDEX_NAME] == INGEST_RECORD_QUERY_INDEX_COLUMNS
        assert str(columns["kind"]["type"]).upper().startswith("VARCHAR")
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
        assert "ingest_records" not in table_names
        assert "ingest_stats" not in table_names
    finally:
        app.state.db_engine.dispose()
