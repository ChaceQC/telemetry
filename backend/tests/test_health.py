from fastapi.testclient import TestClient

from app.core.application import create_app
from app.core.config import Settings


def test_health_check_returns_runtime_metadata() -> None:
    settings = Settings(
        app_name="telemetry-backend-test",
        app_version="0.1.0",
        environment="test",
        port=29117,
    )
    client = TestClient(create_app(settings))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "telemetry-backend-test",
        "version": "0.1.0",
        "environment": "test",
        "port": 29117,
    }
