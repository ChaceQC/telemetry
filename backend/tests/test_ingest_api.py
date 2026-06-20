from argparse import Namespace
from pathlib import Path
from typing import cast

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select

from app.core.application import create_app
from app.core.config import Settings
from app.db.base import Base
from app.models.ingest import IngestRecordModel
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.services.auth import AuthService, hash_password

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
        table_names = inspect(app.state.db_engine).get_table_names()
        assert "ingest_records" in table_names
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
    finally:
        app.state.db_engine.dispose()
