import json
import subprocess
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_ROOT.parent
INIT_SQL = BACKEND_ROOT / "docker" / "clickhouse" / "init" / "01-create-telemetry-tables.sql"
COMPOSE_FILE = REPOSITORY_ROOT / "docker-compose.dev.yml"
ENV_FILE = REPOSITORY_ROOT / ".env.example"
INIT_TARGET = "/docker-entrypoint-initdb.d/01-create-telemetry-tables.sql"


def test_clickhouse_init_sql_declares_stage_two_tables() -> None:
    sql = INIT_SQL.read_text(encoding="utf-8")

    for table_name in ("metric_samples", "log_records", "ingest_stats", "trace_spans"):
        assert f"CREATE TABLE IF NOT EXISTS telemetry.{table_name}" in sql

    assert sql.count("ENGINE = MergeTree") == 4
    assert "ORDER BY (project_id, name, timestamp)" in sql
    assert "ORDER BY (project_id, level, source, timestamp)" in sql


def test_clickhouse_compose_config_mounts_init_sql() -> None:
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

    clickhouse_service = config["services"]["clickhouse"]
    init_mounts = [
        volume for volume in clickhouse_service["volumes"] if volume.get("target") == INIT_TARGET
    ]

    assert init_mounts
    assert init_mounts[0].get("read_only") is True
    assert Path(init_mounts[0]["source"]).name == INIT_SQL.name
