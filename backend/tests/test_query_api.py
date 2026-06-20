from __future__ import annotations

from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
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
    assert [event["type"] for event in all_response.json()] == [
        "incident.opened",
        "deploy.started",
    ]
    assert filtered_response.status_code == 200
    filtered_events = filtered_response.json()
    assert len(filtered_events) == 1
    assert filtered_events[0]["project_id"] == project["id"]
    assert filtered_events[0]["type"] == "deploy.started"
    assert filtered_events[0]["source"] == "ci"
    assert filtered_events[0]["payload"] == {"deploy_id": "d-1"}
    assert filtered_events[0]["occurred_at"].startswith("2026-06-20T10:00:00")


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
    assert all_response.json() == []
    assert project_response.status_code == 404
    assert project_response.json()["detail"] == "项目不存在"


def test_query_events_requires_user_token() -> None:
    client = build_client()

    response = client.get("/api/v1/query/events")

    assert response.status_code == 401
    assert response.json()["detail"] == "缺少访问令牌"
