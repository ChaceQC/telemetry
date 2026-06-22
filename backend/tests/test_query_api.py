from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects import mysql, sqlite
from sqlalchemy.dialects.mysql import mariadb

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.ingest import IngestRecordModel
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.query import (
    _log_attribute_string_equals,
    _metric_window_epoch,
    _payload_duration_ms,
    _payload_string_field_equals,
)
from app.schemas.ingest import IngestKind
from app.services.auth import AuthService, hash_password

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
) -> dict[str, str]:
    user = create_test_user(client, username=username, is_superuser=is_superuser)
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
    return response.json()


def create_api_key(
    client: TestClient,
    project_id: object,
    auth_headers: dict[str, str],
) -> str:
    response = client.post(
        f"/api/v1/projects/{project_id}/api-keys",
        headers=auth_headers,
        json={"name": "query-ingest"},
    )
    assert response.status_code == 201
    return str(response.json()["api_key"])


def create_ingest_api_key(
    client: TestClient,
    *,
    username: str,
    project_key: str,
) -> tuple[dict[str, object], str, dict[str, str]]:
    auth_headers = create_auth_headers(client, username=username)
    project = create_project(client, auth_headers, project_key)
    raw_key = create_api_key(client, project["id"], auth_headers)
    return project, raw_key, auth_headers


def set_ingest_records_received_at(
    client: TestClient,
    *,
    project_id: object,
    kind: IngestKind,
    received_at: datetime,
) -> None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        records = session.query(IngestRecordModel).filter(
            IngestRecordModel.project_id == project_id,
            IngestRecordModel.kind == kind.value,
        )
        for record in records:
            record.received_at = received_at
        session.commit()


def set_ingest_record_received_at(
    client: TestClient,
    *,
    record_id: object,
    received_at: datetime,
) -> None:
    app = _tested_app(client)
    with app.state.db_session_factory() as session:
        record = session.get(IngestRecordModel, record_id)
        assert record is not None
        record.received_at = received_at
        session.commit()


def test_query_events_lists_ingested_events_with_filters() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-owner",
        project_key="query-project",
    )

    first_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "type": "deploy.started",
            "source": "ci",
            "timestamp": "2026-06-20T10:00:00Z",
            "payload": {"deploy_id": "d-1"},
        },
    )
    second_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "type": "incident.opened",
            "source": "ops",
            "timestamp": "2026-06-20T11:00:00Z",
            "payload": {"incident_id": "i-1"},
        },
    )
    all_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={"project_id": project["id"]},
    )
    filtered_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "type": "deploy.started",
            "source": "ci",
            "occurred_from": "2026-06-20T09:00:00Z",
            "occurred_to": "2026-06-20T10:30:00Z",
        },
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    assert all_response.status_code == 200
    all_body = all_response.json()
    assert all_body["next_cursor"] is None
    assert [event["type"] for event in all_body["items"]] == [
        "incident.opened",
        "deploy.started",
    ]
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["next_cursor"] is None
    filtered_events = filtered_body["items"]
    assert len(filtered_events) == 1
    assert filtered_events[0]["project_id"] == project["id"]
    assert filtered_events[0]["type"] == "deploy.started"
    assert filtered_events[0]["source"] == "ci"
    assert filtered_events[0]["payload"] == {"deploy_id": "d-1"}
    assert filtered_events[0]["occurred_at"].startswith("2026-06-20T10:00:00")


def test_query_logs_lists_ingested_logs_with_filters() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-owner",
        project_key="query-log-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "deployment finished",
                    "source": "app",
                    "logger": "deploy.worker",
                    "trace_id": "trace-1",
                    "span_id": "span-1",
                    "timestamp": "2026-06-20T10:00:00Z",
                    "attributes": {"service": "api"},
                    "payload": {"duration_ms": 42},
                },
                {
                    "level": "error",
                    "message": "retry failed",
                    "source": "worker",
                    "timestamp": "2026-06-20T11:00:00Z",
                    "attributes": {"attempt": 3},
                },
            ]
        },
    )
    all_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"]},
    )
    filtered_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "level": "info",
            "source": "app",
            "occurred_from": "2026-06-20T09:00:00Z",
            "occurred_to": "2026-06-20T10:30:00Z",
        },
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    all_body = all_response.json()
    assert all_body["next_cursor"] is None
    assert [log["level"] for log in all_body["items"]] == ["error", "info"]
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["next_cursor"] is None
    filtered_logs = filtered_body["items"]
    assert len(filtered_logs) == 1
    assert filtered_logs[0]["project_id"] == project["id"]
    assert filtered_logs[0]["level"] == "info"
    assert filtered_logs[0]["message"] == "deployment finished"
    assert filtered_logs[0]["source"] == "app"
    assert filtered_logs[0]["logger"] == "deploy.worker"
    assert filtered_logs[0]["trace_id"] == "trace-1"
    assert filtered_logs[0]["span_id"] == "span-1"
    assert filtered_logs[0]["attributes"] == {"service": "api"}
    assert filtered_logs[0]["payload"] == {"duration_ms": 42}
    assert filtered_logs[0]["occurred_at"].startswith("2026-06-20T10:00:00")


def test_query_logs_keyword_matches_message_and_payload_text() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-owner",
        project_key="query-log-keyword-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "deployment keyword finished",
                    "source": "app",
                    "payload": {"release_id": "rel-001"},
                },
                {
                    "level": "info",
                    "message": "cache warmed",
                    "source": "app",
                    "payload": {"request_id": "payload-keyword-001"},
                },
                {
                    "level": "info",
                    "message": "nested payload",
                    "source": "app",
                    "payload": {
                        "details": {"release": "nested-keyword-001"},
                        "steps": ["array-keyword-001"],
                    },
                },
                {
                    "level": "info",
                    "message": "unrelated log",
                    "source": "app",
                    "payload": {"request_id": "boring"},
                },
            ]
        },
    )
    message_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "  deployment keyword  "},
    )
    payload_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "payload-keyword-001"},
    )
    nested_payload_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "nested-keyword-001"},
    )
    array_payload_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "array-keyword-001"},
    )
    payload_key_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "request_id"},
    )
    miss_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "missing-keyword"},
    )

    assert ingest_response.status_code == 202
    assert message_response.status_code == 200
    assert [log["message"] for log in message_response.json()["items"]] == [
        "deployment keyword finished"
    ]
    assert payload_response.status_code == 200
    assert [log["message"] for log in payload_response.json()["items"]] == ["cache warmed"]
    assert nested_payload_response.status_code == 200
    assert [log["message"] for log in nested_payload_response.json()["items"]] == ["nested payload"]
    assert array_payload_response.status_code == 200
    assert [log["message"] for log in array_payload_response.json()["items"]] == ["nested payload"]
    assert payload_key_response.status_code == 200
    assert payload_key_response.json() == {"items": [], "next_cursor": None}
    assert miss_response.status_code == 200
    assert miss_response.json() == {"items": [], "next_cursor": None}


def test_query_logs_keyword_ignores_wrapper_keys_and_null_scaffold() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-wrapper-owner",
        project_key="query-log-keyword-wrapper-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "ordinary health check",
                    "source": "app",
                }
            ]
        },
    )

    assert ingest_response.status_code == 202
    for keyword in ("payload", "trace_id", "logger", "null"):
        response = client.get(
            "/api/v1/query/logs",
            headers=admin_headers,
            params={"project_id": project["id"], "keyword": keyword},
        )
        assert response.status_code == 200
        assert response.json() == {"items": [], "next_cursor": None}


def test_query_logs_keyword_escapes_like_wildcards_as_literals() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-literal-owner",
        project_key="query-log-keyword-literal-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "literal percent 100% done",
                    "source": "app",
                },
                {
                    "level": "info",
                    "message": "literal percent 100X done",
                    "source": "app",
                },
                {
                    "level": "info",
                    "message": "literal underscore job_alpha done",
                    "source": "app",
                },
                {
                    "level": "info",
                    "message": "literal underscore jobXalpha done",
                    "source": "app",
                },
                {
                    "level": "info",
                    "message": r"literal backslash C:\logs\app",
                    "source": "app",
                },
                {
                    "level": "info",
                    "message": "literal backslash C:/logs/app",
                    "source": "app",
                },
            ]
        },
    )

    assert ingest_response.status_code == 202
    expected_messages_by_keyword = {
        "100%": ["literal percent 100% done"],
        "job_alpha": ["literal underscore job_alpha done"],
        "\\": [r"literal backslash C:\logs\app"],
    }
    for keyword, expected_messages in expected_messages_by_keyword.items():
        response = client.get(
            "/api/v1/query/logs",
            headers=admin_headers,
            params={"project_id": project["id"], "keyword": keyword},
        )
        assert response.status_code == 200
        assert [log["message"] for log in response.json()["items"]] == expected_messages


def test_query_logs_keyword_combines_with_filters_and_project_permissions() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-filter-owner",
        project_key="query-log-keyword-filter-project",
    )
    other_project, other_key, _other_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-filter-other",
        project_key="query-log-keyword-filter-other-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle matched log",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "info",
                    "message": "needle wrong level",
                    "source": "api",
                    "timestamp": "2026-06-20T10:05:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong source",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:10:00Z",
                },
                {
                    "level": "error",
                    "message": "needle outside time",
                    "source": "api",
                    "timestamp": "2026-06-20T11:00:00Z",
                },
            ]
        },
    )
    other_ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {other_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle other project",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "keyword": "needle",
            "level": "error",
            "source": "api",
            "occurred_from": "2026-06-20T09:59:00Z",
            "occurred_to": "2026-06-20T10:30:00Z",
        },
    )
    unauthorized_project_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": other_project["id"], "keyword": "needle"},
    )

    assert project["id"] != other_project["id"]
    assert ingest_response.status_code == 202
    assert other_ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    filtered_logs = filtered_response.json()["items"]
    assert [log["message"] for log in filtered_logs] == ["needle matched log"]
    assert filtered_logs[0]["project_id"] == project["id"]
    assert unauthorized_project_response.status_code == 404
    assert unauthorized_project_response.json()["detail"] == "项目不存在"


def test_query_logs_trace_and_span_filter_exact_structured_fields() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-trace-owner",
        project_key="query-log-trace-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "trace span target",
                    "source": "api",
                    "trace_id": "trace-a",
                    "span_id": "span-a",
                    "payload": {
                        "trace_id": "payload-shadow-trace",
                        "span_id": "payload-shadow-span",
                    },
                },
                {
                    "level": "info",
                    "message": "same trace different span",
                    "source": "api",
                    "trace_id": "trace-a",
                    "span_id": "span-b",
                },
                {
                    "level": "info",
                    "message": "same span different trace",
                    "source": "api",
                    "trace_id": "trace-b",
                    "span_id": "span-a",
                },
                {
                    "level": "info",
                    "message": "business payload only",
                    "source": "api",
                    "payload": {"trace_id": "trace-a", "span_id": "span-a"},
                },
            ]
        },
    )
    trace_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": "  trace-a  "},
    )
    span_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "span_id": "span-a"},
    )
    combined_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "trace-a",
            "span_id": "  span-a  ",
        },
    )
    business_payload_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "payload-shadow-trace",
            "span_id": "payload-shadow-span",
        },
    )
    blank_trace_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": "   "},
    )

    assert ingest_response.status_code == 202
    assert trace_response.status_code == 200
    assert sorted(log["message"] for log in trace_response.json()["items"]) == [
        "same trace different span",
        "trace span target",
    ]
    assert span_response.status_code == 200
    assert sorted(log["message"] for log in span_response.json()["items"]) == [
        "same span different trace",
        "trace span target",
    ]
    assert combined_response.status_code == 200
    assert [log["message"] for log in combined_response.json()["items"]] == ["trace span target"]
    assert business_payload_response.status_code == 200
    assert business_payload_response.json() == {"items": [], "next_cursor": None}
    assert blank_trace_response.status_code == 200
    assert len(blank_trace_response.json()["items"]) == 4


def test_query_logs_trace_and_span_validate_trimmed_length() -> None:
    client = build_client()
    project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-trace-length-owner",
        project_key="query-log-trace-length-project",
    )

    valid_trace_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": f"  {'t' * 128}  "},
    )
    long_trace_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": "t" * 129},
    )
    long_span_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "span_id": "s" * 129},
    )

    assert valid_trace_response.status_code == 200
    assert long_trace_response.status_code == 422
    assert long_trace_response.json()["detail"] == "trace_id 长度不能超过 128"
    assert long_span_response.status_code == 422
    assert long_span_response.json()["detail"] == "span_id 长度不能超过 128"


def test_query_logs_request_and_user_filter_exact_attribute_fields() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-owner",
        project_key="query-log-request-user-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "request user target",
                    "source": "api",
                    "attributes": {
                        "request_id": "request-a",
                        "user_id": "user-a",
                    },
                    "payload": {
                        "request_id": "payload-shadow-request",
                        "user_id": "payload-shadow-user",
                    },
                },
                {
                    "level": "info",
                    "message": "same request different user",
                    "source": "api",
                    "attributes": {
                        "request_id": "request-a",
                        "user_id": "user-b",
                    },
                },
                {
                    "level": "info",
                    "message": "same user different request",
                    "source": "api",
                    "attributes": {
                        "request_id": "request-b",
                        "user_id": "user-a",
                    },
                },
                {
                    "level": "info",
                    "message": "business payload only",
                    "source": "api",
                    "payload": {
                        "request_id": "request-a",
                        "user_id": "user-a",
                    },
                },
            ]
        },
    )
    request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": "  request-a  "},
    )
    user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": "user-a"},
    )
    combined_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "request-a",
            "user_id": "  user-a  ",
        },
    )
    business_payload_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "payload-shadow-request",
            "user_id": "payload-shadow-user",
        },
    )
    blank_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": "   ", "user_id": "  "},
    )

    assert ingest_response.status_code == 202
    assert request_response.status_code == 200
    assert sorted(log["message"] for log in request_response.json()["items"]) == [
        "request user target",
        "same request different user",
    ]
    assert user_response.status_code == 200
    assert sorted(log["message"] for log in user_response.json()["items"]) == [
        "request user target",
        "same user different request",
    ]
    assert combined_response.status_code == 200
    assert [log["message"] for log in combined_response.json()["items"]] == ["request user target"]
    assert business_payload_response.status_code == 200
    assert business_payload_response.json() == {"items": [], "next_cursor": None}
    assert blank_response.status_code == 200
    assert len(blank_response.json()["items"]) == 4


def test_query_logs_request_and_user_filter_only_matches_json_string_attributes() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-json-type-owner",
        project_key="query-log-request-user-json-type-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "string request user target",
                    "source": "api",
                    "attributes": {"request_id": "123", "user_id": "123"},
                },
                {
                    "level": "info",
                    "message": "numeric request user ignored",
                    "source": "api",
                    "attributes": {"request_id": 123, "user_id": 123},
                },
                {
                    "level": "info",
                    "message": "boolean request user ignored",
                    "source": "api",
                    "attributes": {"request_id": True, "user_id": True},
                },
                {
                    "level": "info",
                    "message": "object request user ignored",
                    "source": "api",
                    "attributes": {
                        "request_id": {"value": "123"},
                        "user_id": {"value": "123"},
                    },
                },
                {
                    "level": "info",
                    "message": "array request user ignored",
                    "source": "api",
                    "attributes": {"request_id": ["123"], "user_id": ["123"]},
                },
                {
                    "level": "info",
                    "message": "business payload request user ignored",
                    "source": "api",
                    "payload": {"request_id": "123", "user_id": "123"},
                },
            ]
        },
    )
    request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": "123"},
    )
    user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": "123"},
    )
    boolean_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": "true"},
    )
    boolean_user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": "true"},
    )
    object_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": '{"value":"123"}'},
    )
    object_user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": '{"value":"123"}'},
    )
    array_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": '["123"]'},
    )
    array_user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": '["123"]'},
    )

    assert ingest_response.status_code == 202
    assert request_response.status_code == 200
    assert [log["message"] for log in request_response.json()["items"]] == [
        "string request user target"
    ]
    assert user_response.status_code == 200
    assert [log["message"] for log in user_response.json()["items"]] == [
        "string request user target"
    ]
    for response in (
        boolean_request_response,
        boolean_user_response,
        object_request_response,
        object_user_response,
        array_request_response,
        array_user_response,
    ):
        assert response.status_code == 200
        assert response.json() == {"items": [], "next_cursor": None}


def test_query_logs_request_and_user_validate_trimmed_length() -> None:
    client = build_client()
    project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-length-owner",
        project_key="query-log-request-user-length-project",
    )

    valid_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": f"  {'r' * 128}  "},
    )
    long_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "request_id": "r" * 129},
    )
    long_user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "user_id": "u" * 129},
    )

    assert valid_request_response.status_code == 200
    assert long_request_response.status_code == 422
    assert long_request_response.json()["detail"] == "request_id 长度不能超过 128"
    assert long_user_response.status_code == 422
    assert long_user_response.json()["detail"] == "user_id 长度不能超过 128"


def test_query_logs_trace_span_combines_with_keyword_filters_and_permissions() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-structured-filter-owner",
        project_key="query-log-structured-filter-project",
    )
    other_project, other_key, _other_headers = create_ingest_api_key(
        client,
        username="query-log-structured-filter-other",
        project_key="query-log-structured-filter-other-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle structured target",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "error",
                    "message": "structured target without keyword",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "level": "info",
                    "message": "needle wrong level",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong source",
                    "source": "worker",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:03:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong trace",
                    "source": "api",
                    "trace_id": "other-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:04:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong span",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "other-span",
                    "timestamp": "2026-06-20T10:05:00Z",
                },
            ]
        },
    )
    other_ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {other_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle other project structured target",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "timestamp": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "keyword": "needle",
            "level": "error",
            "source": "api",
            "trace_id": "combo-trace",
            "span_id": "combo-span",
        },
    )
    unauthorized_project_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": other_project["id"], "trace_id": "combo-trace"},
    )

    assert project["id"] != other_project["id"]
    assert ingest_response.status_code == 202
    assert other_ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    filtered_logs = filtered_response.json()["items"]
    assert [log["message"] for log in filtered_logs] == ["needle structured target"]
    assert filtered_logs[0]["project_id"] == project["id"]
    assert unauthorized_project_response.status_code == 404
    assert unauthorized_project_response.json()["detail"] == "项目不存在"


def test_query_logs_request_user_combines_with_existing_filters_and_permissions() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-filter-owner",
        project_key="query-log-request-user-filter-project",
    )
    other_project, other_key, _other_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-filter-other",
        project_key="query-log-request-user-filter-other-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle request user target",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "error",
                    "message": "request user target without keyword",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "level": "info",
                    "message": "needle wrong level",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong source",
                    "source": "worker",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:03:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong trace",
                    "source": "api",
                    "trace_id": "other-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:04:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong span",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "other-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:05:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong request",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "other-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:06:00Z",
                },
                {
                    "level": "error",
                    "message": "needle wrong user",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "other-user",
                    },
                    "timestamp": "2026-06-20T10:07:00Z",
                },
            ]
        },
    )
    other_ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {other_key}"},
        json={
            "logs": [
                {
                    "level": "error",
                    "message": "needle other project request user target",
                    "source": "api",
                    "trace_id": "combo-trace",
                    "span_id": "combo-span",
                    "attributes": {
                        "request_id": "combo-request",
                        "user_id": "combo-user",
                    },
                    "timestamp": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "keyword": "needle",
            "level": "error",
            "source": "api",
            "trace_id": "combo-trace",
            "span_id": "combo-span",
            "request_id": "combo-request",
            "user_id": "combo-user",
        },
    )
    unauthorized_project_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": other_project["id"], "request_id": "combo-request"},
    )

    assert project["id"] != other_project["id"]
    assert ingest_response.status_code == 202
    assert other_ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    filtered_logs = filtered_response.json()["items"]
    assert [log["message"] for log in filtered_logs] == ["needle request user target"]
    assert filtered_logs[0]["project_id"] == project["id"]
    assert unauthorized_project_response.status_code == 404
    assert unauthorized_project_response.json()["detail"] == "项目不存在"


def test_query_traces_lists_ingested_spans_with_filters() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-owner",
        project_key="query-trace-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "trace-a",
                    "span_id": "span-root",
                    "name": "GET /api/orders",
                    "start_time": "2026-06-20T10:00:00Z",
                    "end_time": "2026-06-20T10:00:00.120Z",
                    "source": "api",
                    "status_code": "ok",
                    "attributes": {"service": "orders"},
                    "payload": {
                        "route": "/api/orders",
                        "trace_id": "payload-shadow-trace",
                    },
                },
                {
                    "trace_id": "trace-a",
                    "span_id": "span-db",
                    "parent_span_id": "span-root",
                    "name": "SELECT orders",
                    "start_time": "2026-06-20T10:00:00.020Z",
                    "duration_ms": 30.5,
                    "source": "db",
                    "status_code": "error",
                    "attributes": {"db.system": "mysql"},
                },
                {
                    "trace_id": "trace-b",
                    "span_id": "span-worker",
                    "name": "worker job",
                    "start_time": "2026-06-20T11:00:00Z",
                    "source": "worker",
                },
            ]
        },
    )
    all_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"]},
    )
    filtered_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "  trace-a  ",
            "span_id": "  span-db  ",
            "name": "SELECT orders",
            "source": "db",
            "status_code": "  error  ",
            "duration_min_ms": 30,
            "duration_max_ms": 31,
            "occurred_from": "2026-06-20T10:00:00Z",
            "occurred_to": "2026-06-20T10:00:01Z",
        },
    )
    business_payload_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": "payload-shadow-trace"},
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    all_body = all_response.json()
    assert all_body["next_cursor"] is None
    assert sorted(span["name"] for span in all_body["items"]) == [
        "GET /api/orders",
        "SELECT orders",
        "worker job",
    ]
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["next_cursor"] is None
    filtered_spans = filtered_body["items"]
    assert len(filtered_spans) == 1
    assert filtered_spans[0]["project_id"] == project["id"]
    assert filtered_spans[0]["trace_id"] == "trace-a"
    assert filtered_spans[0]["span_id"] == "span-db"
    assert filtered_spans[0]["parent_span_id"] == "span-root"
    assert filtered_spans[0]["name"] == "SELECT orders"
    assert filtered_spans[0]["start_time"].startswith("2026-06-20T10:00:00.020")
    assert filtered_spans[0]["end_time"] is None
    assert filtered_spans[0]["duration_ms"] == 30.5
    assert filtered_spans[0]["status_code"] == "error"
    assert filtered_spans[0]["source"] == "db"
    assert filtered_spans[0]["attributes"] == {"db.system": "mysql"}
    assert filtered_spans[0]["payload"] == {}
    assert filtered_spans[0]["occurred_at"].startswith("2026-06-20T10:00:00.020")
    assert business_payload_response.status_code == 200
    assert business_payload_response.json() == {"items": [], "next_cursor": None}


def test_query_traces_filters_status_code_and_duration_bounds() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-duration-owner",
        project_key="query-trace-duration-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "duration-trace",
                    "span_id": "span-fast",
                    "name": "fast",
                    "start_time": "2026-06-20T10:00:00Z",
                    "duration_ms": 9.5,
                    "status_code": "error",
                },
                {
                    "trace_id": "duration-trace",
                    "span_id": "span-match",
                    "name": "match",
                    "start_time": "2026-06-20T10:01:00Z",
                    "duration_ms": 30.5,
                    "status_code": "error",
                },
                {
                    "trace_id": "duration-trace",
                    "span_id": "span-slow",
                    "name": "slow",
                    "start_time": "2026-06-20T10:02:00Z",
                    "duration_ms": 60,
                    "status_code": "error",
                },
                {
                    "trace_id": "duration-trace",
                    "span_id": "span-ok",
                    "name": "ok",
                    "start_time": "2026-06-20T10:03:00Z",
                    "duration_ms": 30.5,
                    "status_code": "ok",
                },
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "duration-trace",
            "status_code": "  error  ",
            "duration_min_ms": 10,
            "duration_max_ms": 40,
        },
    )
    blank_status_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "duration-trace",
            "status_code": "   ",
        },
    )

    assert ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    body = filtered_response.json()
    assert body["next_cursor"] is None
    assert [span["span_id"] for span in body["items"]] == ["span-match"]
    assert blank_status_response.status_code == 200
    assert sorted(span["span_id"] for span in blank_status_response.json()["items"]) == [
        "span-fast",
        "span-match",
        "span-ok",
        "span-slow",
    ]


def test_query_traces_filters_occurred_to_with_millisecond_precision() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-millisecond-owner",
        project_key="query-trace-millisecond-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "millisecond-trace",
                    "span_id": "span-before-cutoff",
                    "name": "before cutoff",
                    "start_time": "2026-06-22T01:00:00.050Z",
                },
                {
                    "trace_id": "millisecond-trace",
                    "span_id": "span-after-cutoff",
                    "name": "after cutoff",
                    "start_time": "2026-06-22T01:00:00.100Z",
                },
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "millisecond-trace",
            "occurred_to": "2026-06-22T01:00:00.075Z",
        },
    )

    assert ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    body = filtered_response.json()
    assert body["next_cursor"] is None
    assert [span["span_id"] for span in body["items"]] == ["span-before-cutoff"]
    assert body["items"][0]["occurred_at"].startswith("2026-06-22T01:00:00.050")


def test_query_traces_trace_and_span_validate_trimmed_length() -> None:
    client = build_client()
    project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-length-owner",
        project_key="query-trace-length-project",
    )

    valid_trace_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": f"  {'t' * 128}  "},
    )
    long_trace_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "trace_id": "t" * 129},
    )
    long_span_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "span_id": "s" * 129},
    )

    assert valid_trace_response.status_code == 200
    assert long_trace_response.status_code == 422
    assert long_trace_response.json()["detail"] == "trace_id 长度不能超过 128"
    assert long_span_response.status_code == 422
    assert long_span_response.json()["detail"] == "span_id 长度不能超过 128"


def test_query_traces_status_and_duration_validate_bounds() -> None:
    client = build_client()
    project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-status-length-owner",
        project_key="query-trace-status-length-project",
    )

    valid_status_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "status_code": f"  {'s' * 64}  "},
    )
    long_status_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "status_code": "s" * 65},
    )
    negative_duration_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "duration_min_ms": -1},
    )
    reversed_duration_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "duration_min_ms": 50,
            "duration_max_ms": 10,
        },
    )
    infinite_duration_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={"project_id": project["id"], "duration_min_ms": "inf"},
    )

    assert valid_status_response.status_code == 200
    assert long_status_response.status_code == 422
    assert long_status_response.json()["detail"] == "status_code 长度不能超过 64"
    assert negative_duration_response.status_code == 422
    assert reversed_duration_response.status_code == 422
    assert reversed_duration_response.json()["detail"] == (
        "duration_min_ms 不能大于 duration_max_ms"
    )
    assert infinite_duration_response.status_code == 422


def test_query_metrics_lists_ingested_metrics_with_filters() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-owner",
        project_key="query-metric-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "http.requests",
                    "value": 12,
                    "unit": "count",
                    "type": "counter",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                    "tags": {"route": "/api/v1/query"},
                    "payload": {"status": 200},
                },
                {
                    "name": "system.cpu",
                    "value": 0.82,
                    "unit": "ratio",
                    "type": "gauge",
                    "source": "node",
                    "timestamp": "2026-06-20T11:00:00Z",
                    "tags": {"host": "host-1"},
                },
            ]
        },
    )
    all_response = client.get(
        "/api/v1/query/metrics",
        headers=admin_headers,
        params={"project_id": project["id"]},
    )
    filtered_response = client.get(
        "/api/v1/query/metrics",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "http.requests",
            "source": "api",
            "occurred_from": "2026-06-20T09:00:00Z",
            "occurred_to": "2026-06-20T10:30:00Z",
        },
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    all_body = all_response.json()
    assert all_body["next_cursor"] is None
    assert [metric["name"] for metric in all_body["items"]] == [
        "system.cpu",
        "http.requests",
    ]
    assert filtered_response.status_code == 200
    filtered_body = filtered_response.json()
    assert filtered_body["next_cursor"] is None
    filtered_metrics = filtered_body["items"]
    assert len(filtered_metrics) == 1
    assert filtered_metrics[0]["project_id"] == project["id"]
    assert filtered_metrics[0]["name"] == "http.requests"
    assert filtered_metrics[0]["value"] == 12
    assert filtered_metrics[0]["unit"] == "count"
    assert filtered_metrics[0]["type"] == "counter"
    assert filtered_metrics[0]["source"] == "api"
    assert filtered_metrics[0]["tags"] == {"route": "/api/v1/query"}
    assert filtered_metrics[0]["payload"] == {"status": 200}
    assert filtered_metrics[0]["occurred_at"].startswith("2026-06-20T10:00:00")


def test_query_metrics_aggregate_supports_aggregations_and_windows() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-aggregate-owner",
        project_key="query-metric-aggregate-project",
    )

    ingest_response = client.post(
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
                    "value": 40,
                    "unit": "ms",
                    "source": "api",
                    "timestamp": "2026-06-20T10:05:00Z",
                },
                {
                    "name": "http.duration",
                    "value": 80,
                    "unit": "ms",
                    "source": "api",
                    "timestamp": "2026-06-20T10:15:01Z",
                },
            ]
        },
    )

    assert ingest_response.status_code == 202
    expected_values = {
        "avg": 15.0,
        "sum": 30.0,
        "min": 10.0,
        "max": 20.0,
        "count": 2.0,
    }
    for aggregation, expected_value in expected_values.items():
        response = client.get(
            "/api/v1/query/metrics/aggregate",
            headers=admin_headers,
            params={
                "project_id": project["id"],
                "name": "http.duration",
                "source": "api",
                "window": "5m",
                "aggregation": aggregation,
            },
        )
        assert response.status_code == 200
        oldest_bucket = response.json()["items"][-1]
        assert oldest_bucket["project_id"] == project["id"]
        assert oldest_bucket["name"] == "http.duration"
        assert oldest_bucket["source"] == "api"
        assert oldest_bucket["window_start"].startswith("2026-06-20T10:00:00")
        assert oldest_bucket["window_end"].startswith("2026-06-20T10:05:00")
        assert oldest_bucket["aggregation"] == aggregation
        assert oldest_bucket["value"] == expected_value
        assert oldest_bucket["sample_count"] == 2
        assert oldest_bucket["unit"] == "ms"

    one_hour_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "http.duration",
            "source": "api",
            "window": "1h",
            "aggregation": "count",
        },
    )
    assert one_hour_response.status_code == 200
    assert len(one_hour_response.json()["items"]) == 1
    assert one_hour_response.json()["items"][0]["window_start"].startswith("2026-06-20T10:00:00")
    assert one_hour_response.json()["items"][0]["value"] == 4.0
    assert one_hour_response.json()["items"][0]["sample_count"] == 4


def test_query_metrics_aggregate_mysql_epoch_bucket_ignores_session_timezone() -> None:
    dialects = {
        "mysql": mysql.dialect(),
        "mariadb": mariadb.MariaDBDialect(),
    }

    for dialect_name, dialect in dialects.items():
        compiled = str(
            _metric_window_epoch(dialect_name, window_seconds=300).compile(
                dialect=dialect,
                compile_kwargs={"literal_binds": True},
            )
        ).lower()

        assert "floor" in compiled
        assert "timestampdiff" in compiled
        assert "'1970-01-01 00:00:00'" in compiled
        assert "occurred_at" in compiled
        assert "unix_timestamp" not in compiled
        assert "/ 300" in compiled or "/ %s" in compiled


def test_query_logs_request_user_attribute_filter_sql_has_json_string_type_guards() -> None:
    dialects = {
        "sqlite": sqlite.dialect(),
        "mysql": mysql.dialect(),
        "mariadb": mariadb.MariaDBDialect(),
    }

    for dialect_name, dialect in dialects.items():
        compiled = str(
            _log_attribute_string_equals(
                "request_id",
                "request-1",
                dialect_name=dialect_name,
            ).compile(
                dialect=dialect,
                compile_kwargs={"literal_binds": True},
            )
        ).lower()

        assert "attributes.request_id" in compiled
        if dialect_name == "sqlite":
            assert "json_type" in compiled
            assert "= 'text'" in compiled
            assert "json_extract" in compiled
        else:
            assert "json_type(json_extract" in compiled
            assert "= 'string'" in compiled
            assert "json_unquote(json_extract" in compiled


def test_query_trace_payload_field_filter_sql_compiles_for_supported_dialects() -> None:
    dialects = {
        "sqlite": sqlite.dialect(),
        "mysql": mysql.dialect(),
        "mariadb": mariadb.MariaDBDialect(),
    }

    for dialect_name, dialect in dialects.items():
        compiled = str(
            _payload_string_field_equals("trace_id", "trace-1").compile(
                dialect=dialect,
                compile_kwargs={"literal_binds": True},
            )
        ).lower()

        assert "trace_id" in compiled
        assert "json_extract" in compiled
        assert "= 'trace-1'" in compiled
        if dialect_name == "sqlite":
            assert "json_unquote" not in compiled
        else:
            assert "json_unquote(json_extract" in compiled


def test_query_trace_duration_filter_sql_compiles_for_supported_dialects() -> None:
    dialects = {
        "sqlite": sqlite.dialect(),
        "mysql": mysql.dialect(),
        "mariadb": mariadb.MariaDBDialect(),
    }

    for dialect_name, dialect in dialects.items():
        compiled = str(
            (_payload_duration_ms() >= 10.5).compile(
                dialect=dialect,
                compile_kwargs={"literal_binds": True},
            )
        ).lower()

        assert "duration_ms" in compiled
        assert "json_extract" in compiled
        assert ">= 10.5" in compiled
        if dialect_name == "sqlite":
            assert "+0.0000000000000000000000" not in compiled
        else:
            assert "+0.0000000000000000000000" in compiled


def test_query_metrics_aggregate_filters_permissions_empty_and_limit() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-aggregate-filter-owner",
        project_key="query-metric-aggregate-filter-project",
    )
    other_project, other_key, _other_headers = create_ingest_api_key(
        client,
        username="query-metric-aggregate-filter-other",
        project_key="query-metric-aggregate-filter-other-project",
    )
    viewer_headers = create_auth_headers(client, username="query-metric-aggregate-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "cpu.usage",
                    "value": 1,
                    "unit": "ratio",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "name": "cpu.usage",
                    "value": 3,
                    "unit": "ratio",
                    "source": "api",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "name": "cpu.usage",
                    "value": 5,
                    "unit": "ratio",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "name": "memory.usage",
                    "value": 7,
                    "unit": "bytes",
                    "source": "api",
                    "timestamp": "2026-06-20T10:03:00Z",
                },
                {
                    "name": "cpu.usage",
                    "value": 9,
                    "unit": "ratio",
                    "source": "api",
                    "timestamp": "2026-06-20T10:06:00Z",
                },
            ]
        },
    )
    other_ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {other_key}"},
        json={
            "metrics": [
                {
                    "name": "cpu.usage",
                    "value": 99,
                    "unit": "ratio",
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    filtered_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "cpu.usage",
            "source": "api",
            "occurred_from": "2026-06-20T09:59:00Z",
            "occurred_to": "2026-06-20T10:04:00Z",
            "aggregation": "sum",
        },
    )
    empty_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={"project_id": project["id"], "name": "missing.metric"},
    )
    limit_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "cpu.usage",
            "source": "api",
            "window": "1m",
            "limit": 1,
        },
    )
    hidden_all_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=viewer_headers,
    )
    hidden_project_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=viewer_headers,
        params={"project_id": project["id"]},
    )
    unauthorized_project_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={"project_id": other_project["id"]},
    )

    assert project["id"] != other_project["id"]
    assert ingest_response.status_code == 202
    assert other_ingest_response.status_code == 202
    assert filtered_response.status_code == 200
    assert filtered_response.json()["items"] == [
        {
            "project_id": project["id"],
            "name": "cpu.usage",
            "source": "api",
            "window_start": "2026-06-20T10:00:00Z",
            "window_end": "2026-06-20T10:05:00Z",
            "aggregation": "sum",
            "value": 4.0,
            "sample_count": 2,
            "unit": "ratio",
        }
    ]
    assert empty_response.status_code == 200
    assert empty_response.json() == {"items": []}
    assert limit_response.status_code == 200
    assert len(limit_response.json()["items"]) == 1
    assert limit_response.json()["items"][0]["window_start"].startswith("2026-06-20T10:06:00")
    assert hidden_all_response.status_code == 200
    assert hidden_all_response.json() == {"items": []}
    assert hidden_project_response.status_code == 404
    assert hidden_project_response.json()["detail"] == "项目不存在"
    assert unauthorized_project_response.status_code == 404
    assert unauthorized_project_response.json()["detail"] == "项目不存在"


def test_query_metrics_aggregate_validates_window_aggregation_and_limit() -> None:
    client = build_client()
    _project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-aggregate-validation-owner",
        project_key="query-metric-aggregate-validation-project",
    )

    invalid_window_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={"window": "10m"},
    )
    invalid_aggregation_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={"aggregation": "p95"},
    )
    invalid_limit_response = client.get(
        "/api/v1/query/metrics/aggregate",
        headers=admin_headers,
        params={"limit": 501},
    )

    assert invalid_window_response.status_code == 422
    assert invalid_aggregation_response.status_code == 422
    assert invalid_limit_response.status_code == 422


def test_query_metrics_aggregate_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/metrics/aggregate")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"


def test_query_events_hide_projects_without_membership() -> None:
    client = build_client()
    project, raw_key, _owner_headers = create_ingest_api_key(
        client,
        username="query-owner-hidden",
        project_key="query-hidden-project",
    )
    other_headers = create_auth_headers(client, username="query-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "deployment", "payload": {"status": "ok"}},
    )
    all_response = client.get("/api/v1/query/events", headers=other_headers)
    project_response = client.get(
        "/api/v1/query/events",
        headers=other_headers,
        params={"project_id": project["id"]},
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    assert all_response.json() == {"items": [], "next_cursor": None}
    assert project_response.status_code == 404
    assert project_response.json()["detail"] == "项目不存在"


def test_query_logs_hide_projects_without_membership() -> None:
    client = build_client()
    project, raw_key, _owner_headers = create_ingest_api_key(
        client,
        username="query-log-owner-hidden",
        project_key="query-log-hidden-project",
    )
    other_headers = create_auth_headers(client, username="query-log-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info", "message": "hidden log"}]},
    )
    all_response = client.get("/api/v1/query/logs", headers=other_headers)
    project_response = client.get(
        "/api/v1/query/logs",
        headers=other_headers,
        params={"project_id": project["id"]},
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    assert all_response.json() == {"items": [], "next_cursor": None}
    assert project_response.status_code == 404
    assert project_response.json()["detail"] == "项目不存在"


def test_query_metrics_hide_projects_without_membership() -> None:
    client = build_client()
    project, raw_key, _owner_headers = create_ingest_api_key(
        client,
        username="query-metric-owner-hidden",
        project_key="query-metric-hidden-project",
    )
    other_headers = create_auth_headers(client, username="query-metric-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "hidden.metric", "value": 1}]},
    )
    all_response = client.get("/api/v1/query/metrics", headers=other_headers)
    project_response = client.get(
        "/api/v1/query/metrics",
        headers=other_headers,
        params={"project_id": project["id"]},
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    assert all_response.json() == {"items": [], "next_cursor": None}
    assert project_response.status_code == 404
    assert project_response.json()["detail"] == "项目不存在"


def test_query_traces_hide_projects_without_membership() -> None:
    client = build_client()
    project, raw_key, _owner_headers = create_ingest_api_key(
        client,
        username="query-trace-owner-hidden",
        project_key="query-trace-hidden-project",
    )
    other_headers = create_auth_headers(client, username="query-trace-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "hidden-trace",
                    "span_id": "hidden-span",
                    "name": "hidden span",
                    "start_time": "2026-06-20T10:00:00Z",
                }
            ]
        },
    )
    all_response = client.get("/api/v1/query/traces", headers=other_headers)
    project_response = client.get(
        "/api/v1/query/traces",
        headers=other_headers,
        params={"project_id": project["id"]},
    )

    assert ingest_response.status_code == 202
    assert all_response.status_code == 200
    assert all_response.json() == {"items": [], "next_cursor": None}
    assert project_response.status_code == 404
    assert project_response.json()["detail"] == "项目不存在"


def test_query_endpoints_hide_missing_project_from_superuser() -> None:
    client = build_client()
    superuser_headers = create_auth_headers(
        client,
        username="query-superuser-missing-project",
        is_superuser=True,
    )

    for path in (
        "/api/v1/query/events",
        "/api/v1/query/logs",
        "/api/v1/query/metrics",
        "/api/v1/query/traces",
        "/api/v1/query/metrics/aggregate",
    ):
        response = client.get(
            path,
            headers=superuser_headers,
            params={"project_id": 999999999},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "项目不存在"


def test_query_events_cursor_paginates_with_received_at_and_id() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-page-owner",
        project_key="query-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    for event_type in ["event-a", "event-b", "event-c"]:
        ingest_response = client.post(
            "/api/v1/ingest/events",
            headers={"Authorization": f"Bearer {raw_key}"},
            json={"type": event_type, "payload": {"type": event_type}},
        )
        assert ingest_response.status_code == 202

    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.event,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={"project_id": project["id"], "limit": 2},
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_filter_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "type": "event-a",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [event["type"] for event in first_body["items"]] == ["event-c", "event-b"]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert [event["type"] for event in second_body["items"]] == ["event-a"]
    assert second_body["next_cursor"] is None
    assert mismatched_filter_response.status_code == 422
    assert mismatched_filter_response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_logs_cursor_paginates_with_received_at_and_id() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-page-owner",
        project_key="query-log-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "log-a",
                    "source": "app",
                    "timestamp": "2026-06-20T10:00:00Z",
                },
                {
                    "level": "info",
                    "message": "log-b",
                    "source": "app",
                    "timestamp": "2026-06-20T10:01:00Z",
                },
                {
                    "level": "info",
                    "message": "log-c",
                    "source": "app",
                    "timestamp": "2026-06-20T10:02:00Z",
                },
                {
                    "level": "info",
                    "message": "ignored-source",
                    "source": "worker",
                    "timestamp": "2026-06-20T10:03:00Z",
                },
                {
                    "level": "error",
                    "message": "ignored-level",
                    "source": "app",
                    "timestamp": "2026-06-20T10:04:00Z",
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.log,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "level": "info",
            "source": "app",
            "limit": 2,
        },
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "level": "info",
            "source": "app",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [log["message"] for log in first_body["items"]] == ["log-c", "log-b"]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert [log["message"] for log in second_body["items"]] == ["log-a"]
    assert second_body["next_cursor"] is None


def test_query_logs_cursor_rejects_keyword_mismatch() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-keyword-page-owner",
        project_key="query-log-keyword-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {"level": "info", "message": "cursor-keyword log-a"},
                {"level": "info", "message": "cursor-keyword log-b"},
                {"level": "info", "message": "cursor-keyword log-c"},
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.log,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"project_id": project["id"], "keyword": "cursor-keyword", "limit": 2},
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "keyword": "cursor-keyword",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_keyword_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "keyword": "other-keyword",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [log["message"] for log in first_body["items"]] == [
        "cursor-keyword log-c",
        "cursor-keyword log-b",
    ]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    assert [log["message"] for log in second_response.json()["items"]] == ["cursor-keyword log-a"]
    assert mismatched_keyword_response.status_code == 422
    assert mismatched_keyword_response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_logs_cursor_rejects_trace_span_mismatch() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-trace-page-owner",
        project_key="query-log-trace-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "cursor trace log-a",
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span",
                },
                {
                    "level": "info",
                    "message": "cursor trace log-b",
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span",
                },
                {
                    "level": "info",
                    "message": "cursor trace log-c",
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span",
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.log,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "span_id": "cursor-span",
            "limit": 2,
        },
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "span_id": "cursor-span",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_trace_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "other-trace",
            "span_id": "cursor-span",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_span_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "span_id": "other-span",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [log["message"] for log in first_body["items"]] == [
        "cursor trace log-c",
        "cursor trace log-b",
    ]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    assert [log["message"] for log in second_response.json()["items"]] == ["cursor trace log-a"]
    assert mismatched_trace_response.status_code == 422
    assert mismatched_trace_response.json()["detail"] == "cursor 无效或不匹配当前查询"
    assert mismatched_span_response.status_code == 422
    assert mismatched_span_response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_logs_cursor_rejects_request_user_mismatch() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-request-user-page-owner",
        project_key="query-log-request-user-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "cursor request user log-a",
                    "attributes": {
                        "request_id": "cursor-request",
                        "user_id": "cursor-user",
                    },
                },
                {
                    "level": "info",
                    "message": "cursor request user log-b",
                    "attributes": {
                        "request_id": "cursor-request",
                        "user_id": "cursor-user",
                    },
                },
                {
                    "level": "info",
                    "message": "cursor request user log-c",
                    "attributes": {
                        "request_id": "cursor-request",
                        "user_id": "cursor-user",
                    },
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.log,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "cursor-request",
            "user_id": "cursor-user",
            "limit": 2,
        },
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "cursor-request",
            "user_id": "cursor-user",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_request_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "other-request",
            "user_id": "cursor-user",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_user_response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "request_id": "cursor-request",
            "user_id": "other-user",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [log["message"] for log in first_body["items"]] == [
        "cursor request user log-c",
        "cursor request user log-b",
    ]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    assert [log["message"] for log in second_response.json()["items"]] == [
        "cursor request user log-a"
    ]
    assert mismatched_request_response.status_code == 422
    assert mismatched_request_response.json()["detail"] == "cursor 无效或不匹配当前查询"
    assert mismatched_user_response.status_code == 422
    assert mismatched_user_response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_traces_cursor_paginates_with_received_at_and_id() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-trace-page-owner",
        project_key="query-trace-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/traces",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "spans": [
                {
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span-a",
                    "name": "cursor span-a",
                    "source": "api",
                    "start_time": "2026-06-20T10:00:00Z",
                    "duration_ms": 10,
                    "status_code": "error",
                },
                {
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span-b",
                    "name": "cursor span-b",
                    "source": "api",
                    "start_time": "2026-06-20T10:01:00Z",
                    "duration_ms": 20,
                    "status_code": "error",
                },
                {
                    "trace_id": "cursor-trace",
                    "span_id": "cursor-span-c",
                    "name": "cursor span-c",
                    "source": "api",
                    "start_time": "2026-06-20T10:02:00Z",
                    "duration_ms": 30,
                    "status_code": "error",
                },
                {
                    "trace_id": "cursor-trace",
                    "span_id": "ignored-source",
                    "name": "ignored source",
                    "source": "worker",
                    "start_time": "2026-06-20T10:03:00Z",
                    "duration_ms": 40,
                    "status_code": "error",
                },
                {
                    "trace_id": "other-trace",
                    "span_id": "cursor-span-d",
                    "name": "ignored trace",
                    "source": "api",
                    "start_time": "2026-06-20T10:04:00Z",
                    "duration_ms": 50,
                    "status_code": "error",
                },
                {
                    "trace_id": "cursor-trace",
                    "span_id": "ignored-status",
                    "name": "ignored status",
                    "source": "api",
                    "start_time": "2026-06-20T10:05:00Z",
                    "duration_ms": 20,
                    "status_code": "ok",
                },
                {
                    "trace_id": "cursor-trace",
                    "span_id": "ignored-duration",
                    "name": "ignored duration",
                    "source": "api",
                    "start_time": "2026-06-20T10:06:00Z",
                    "duration_ms": 60,
                    "status_code": "error",
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.trace,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 10,
            "duration_max_ms": 30,
            "limit": 2,
        },
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 10,
            "duration_max_ms": 30,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_trace_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "other-trace",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 10,
            "duration_max_ms": 30,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_span_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "span_id": "cursor-span-b",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 10,
            "duration_max_ms": 30,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_status_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "source": "api",
            "status_code": "ok",
            "duration_min_ms": 10,
            "duration_max_ms": 30,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_duration_min_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 20,
            "duration_max_ms": 30,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )
    mismatched_duration_max_response = client.get(
        "/api/v1/query/traces",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "trace_id": "cursor-trace",
            "source": "api",
            "status_code": "error",
            "duration_min_ms": 10,
            "duration_max_ms": 20,
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [span["name"] for span in first_body["items"]] == [
        "cursor span-c",
        "cursor span-b",
    ]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert [span["name"] for span in second_body["items"]] == ["cursor span-a"]
    assert second_body["next_cursor"] is None
    assert mismatched_trace_response.status_code == 422
    assert mismatched_trace_response.json()["detail"] == "cursor 无效或不匹配当前查询"
    assert mismatched_span_response.status_code == 422
    assert mismatched_span_response.json()["detail"] == "cursor 无效或不匹配当前查询"
    assert mismatched_status_response.status_code == 422
    assert mismatched_status_response.json()["detail"] == "cursor 无效或不匹配当前查询"
    assert mismatched_duration_min_response.status_code == 422
    assert mismatched_duration_min_response.json()["detail"] == ("cursor 无效或不匹配当前查询")
    assert mismatched_duration_max_response.status_code == 422
    assert mismatched_duration_max_response.json()["detail"] == ("cursor 无效或不匹配当前查询")


def test_query_log_context_returns_target_and_neighbors_in_time_order() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-context-owner",
        project_key="query-log-context-project",
    )
    other_project, other_key, _other_headers = create_ingest_api_key(
        client,
        username="query-log-context-other",
        project_key="query-log-context-other-project",
    )

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "logs": [
                {
                    "level": "info",
                    "message": "older same-project log",
                    "source": "app",
                },
                {
                    "level": "error",
                    "message": "same-time lower-id log",
                    "source": "worker",
                },
                {
                    "level": "warn",
                    "message": "target log",
                    "source": "app",
                },
                {
                    "level": "debug",
                    "message": "same-time higher-id log",
                    "source": "worker",
                },
                {
                    "level": "info",
                    "message": "newer same-project log",
                    "source": "app",
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    log_receipts = ingest_response.json()["receipts"]

    event_response = client.post(
        "/api/v1/ingest/events",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"type": "ignored.event", "payload": {"message": "not a log"}},
    )
    metric_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"metrics": [{"name": "ignored.metric", "value": 1}]},
    )
    other_log_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {other_key}"},
        json={"logs": [{"level": "info", "message": "other project log"}]},
    )
    assert event_response.status_code == 202
    assert metric_response.status_code == 202
    assert other_log_response.status_code == 202

    older_time = datetime(2026, 6, 21, 7, 59, tzinfo=UTC)
    target_time = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)
    newer_time = datetime(2026, 6, 21, 8, 1, tzinfo=UTC)
    for index, receipt in enumerate(log_receipts):
        set_ingest_record_received_at(
            client,
            record_id=receipt["id"],
            received_at=[older_time, target_time, target_time, target_time, newer_time][index],
        )
    for receipt in [
        event_response.json(),
        metric_response.json()["receipts"][0],
        other_log_response.json()["receipts"][0],
    ]:
        set_ingest_record_received_at(
            client,
            record_id=receipt["id"],
            received_at=target_time,
        )

    context_response = client.get(
        f"/api/v1/query/logs/{log_receipts[2]['id']}/context",
        headers=admin_headers,
        params={"before": 2, "after": 2},
    )

    assert project["id"] != other_project["id"]
    assert context_response.status_code == 200
    body = context_response.json()
    assert body["target"]["message"] == "target log"
    assert body["target"]["project_id"] == project["id"]
    assert [log["message"] for log in body["before"]] == [
        "older same-project log",
        "same-time lower-id log",
    ]
    assert [log["message"] for log in body["after"]] == [
        "same-time higher-id log",
        "newer same-project log",
    ]
    assert [log["level"] for log in body["before"]] == ["info", "error"]
    assert [log["source"] for log in body["after"]] == ["worker", "app"]


def test_query_log_context_hides_missing_and_unauthorized_logs() -> None:
    client = build_client()
    _project, raw_key, _owner_headers = create_ingest_api_key(
        client,
        username="query-log-context-hidden-owner",
        project_key="query-log-context-hidden-project",
    )
    other_headers = create_auth_headers(client, username="query-log-context-hidden-viewer")

    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info", "message": "hidden context log"}]},
    )
    assert ingest_response.status_code == 202
    log_id = ingest_response.json()["receipts"][0]["id"]

    unauthorized_response = client.get(
        f"/api/v1/query/logs/{log_id}/context",
        headers=other_headers,
    )
    missing_response = client.get(
        "/api/v1/query/logs/999999/context",
        headers=other_headers,
    )

    assert unauthorized_response.status_code == 404
    assert unauthorized_response.json()["detail"] == "日志不存在"
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "日志不存在"


def test_query_log_context_validates_before_and_after_bounds() -> None:
    client = build_client()
    _project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-context-bounds-owner",
        project_key="query-log-context-bounds-project",
    )
    ingest_response = client.post(
        "/api/v1/ingest/logs",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={"logs": [{"level": "info", "message": "bounded context log"}]},
    )
    assert ingest_response.status_code == 202
    log_id = ingest_response.json()["receipts"][0]["id"]

    empty_context_response = client.get(
        f"/api/v1/query/logs/{log_id}/context",
        headers=admin_headers,
        params={"before": 0, "after": 0},
    )
    too_many_before_response = client.get(
        f"/api/v1/query/logs/{log_id}/context",
        headers=admin_headers,
        params={"before": 21},
    )
    negative_after_response = client.get(
        f"/api/v1/query/logs/{log_id}/context",
        headers=admin_headers,
        params={"after": -1},
    )

    assert empty_context_response.status_code == 200
    assert empty_context_response.json()["before"] == []
    assert empty_context_response.json()["after"] == []
    assert too_many_before_response.status_code == 422
    assert negative_after_response.status_code == 422


def test_query_metrics_cursor_paginates_with_received_at_and_id() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-page-owner",
        project_key="query-metric-page-project",
    )
    received_at = datetime(2026, 6, 21, 8, 0, tzinfo=UTC)

    ingest_response = client.post(
        "/api/v1/ingest/metrics",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "metrics": [
                {
                    "name": "stable.metric",
                    "value": 1,
                    "source": "api",
                    "timestamp": "2026-06-20T10:00:00Z",
                    "payload": {"sample": "metric-a"},
                },
                {
                    "name": "stable.metric",
                    "value": 2,
                    "source": "api",
                    "timestamp": "2026-06-20T10:01:00Z",
                    "payload": {"sample": "metric-b"},
                },
                {
                    "name": "stable.metric",
                    "value": 3,
                    "source": "api",
                    "timestamp": "2026-06-20T10:02:00Z",
                    "payload": {"sample": "metric-c"},
                },
                {
                    "name": "stable.metric",
                    "value": 4,
                    "source": "worker",
                    "timestamp": "2026-06-20T10:03:00Z",
                    "payload": {"sample": "ignored-source"},
                },
                {
                    "name": "other.metric",
                    "value": 5,
                    "source": "api",
                    "timestamp": "2026-06-20T10:04:00Z",
                    "payload": {"sample": "ignored-name"},
                },
            ]
        },
    )
    assert ingest_response.status_code == 202
    set_ingest_records_received_at(
        client,
        project_id=project["id"],
        kind=IngestKind.metric,
        received_at=received_at,
    )

    first_response = client.get(
        "/api/v1/query/metrics",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "stable.metric",
            "source": "api",
            "limit": 2,
        },
    )
    first_body = first_response.json()
    second_response = client.get(
        "/api/v1/query/metrics",
        headers=admin_headers,
        params={
            "project_id": project["id"],
            "name": "stable.metric",
            "source": "api",
            "limit": 2,
            "cursor": first_body["next_cursor"],
        },
    )

    assert first_response.status_code == 200
    assert [metric["payload"]["sample"] for metric in first_body["items"]] == [
        "metric-c",
        "metric-b",
    ]
    assert isinstance(first_body["next_cursor"], str)
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert [metric["payload"]["sample"] for metric in second_body["items"]] == ["metric-a"]
    assert second_body["next_cursor"] is None


def test_query_logs_rejects_invalid_cursor() -> None:
    client = build_client()
    _project, _raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-log-bad-cursor-owner",
        project_key="query-log-bad-cursor-project",
    )

    response = client.get(
        "/api/v1/query/logs",
        headers=admin_headers,
        params={"cursor": "not-a-valid-cursor"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_metrics_rejects_cursor_from_other_query_kind() -> None:
    client = build_client()
    project, raw_key, admin_headers = create_ingest_api_key(
        client,
        username="query-metric-cursor-owner",
        project_key="query-metric-cursor-project",
    )
    for event_type in ["metric-cursor-a", "metric-cursor-b"]:
        response = client.post(
            "/api/v1/ingest/events",
            headers={"Authorization": f"Bearer {raw_key}"},
            json={"type": event_type, "payload": {"type": event_type}},
        )
        assert response.status_code == 202

    event_response = client.get(
        "/api/v1/query/events",
        headers=admin_headers,
        params={"project_id": project["id"], "limit": 1},
    )
    event_body = event_response.json()
    metric_response = client.get(
        "/api/v1/query/metrics",
        headers=admin_headers,
        params={"cursor": event_body["next_cursor"]},
    )

    assert event_response.status_code == 200
    assert isinstance(event_body["next_cursor"], str)
    assert metric_response.status_code == 422
    assert metric_response.json()["detail"] == "cursor 无效或不匹配当前查询"


def test_query_events_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/events")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"


def test_query_logs_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/logs")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"


def test_query_metrics_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/metrics")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"


def test_query_traces_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/traces")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"
