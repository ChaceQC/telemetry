import json
import subprocess
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_ROOT.parent
INIT_SCRIPT = REPOSITORY_ROOT / "docker" / "mongodb" / "init-app-user.js"
COMPOSE_FILE = REPOSITORY_ROOT / "docker-compose.dev.yml"
ENV_FILE = REPOSITORY_ROOT / ".env.example"
INIT_TARGET = "/docker-entrypoint-initdb.d/10-init-app-user.js"


def test_mongodb_init_script_declares_events_collection_and_indexes() -> None:
    script = INIT_SCRIPT.read_text(encoding="utf-8")

    assert 'createCollection("events")' in script
    assert 'getCollection("events")' in script
    assert "idx_events_project_occurred_at" in script
    assert "idx_events_project_env_service_time" in script
    assert "idx_events_type_occurred_at" in script
    assert "idx_events_expires_at_ttl" in script
    assert "expireAfterSeconds: 0" in script
    assert "MONGODB_USER and MONGODB_PASSWORD are required" in script


def test_mongodb_compose_config_mounts_init_script() -> None:
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(ENV_FILE),
            "-f",
            str(COMPOSE_FILE),
            "config",
            "--format",
            "json",
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        encoding="utf-8",
        text=True,
    )
    config: dict[str, Any] = json.loads(result.stdout)

    mongodb_service = config["services"]["mongodb"]
    init_mounts = [
        volume for volume in mongodb_service["volumes"] if volume.get("target") == INIT_TARGET
    ]

    assert init_mounts
    assert init_mounts[0].get("read_only") is True
    assert Path(init_mounts[0]["source"]).name == INIT_SCRIPT.name
