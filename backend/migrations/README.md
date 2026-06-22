# 后端数据库迁移

迁移使用 Alembic 管理。默认读取 `DATABASE_URL`，未设置时使用本地开发 SQLite：

```powershell
uv run alembic upgrade head
```

连接 MySQL 时示例：

```powershell
$env:DATABASE_URL='mysql+pymysql://telemetry:telemetry@127.0.0.1:3306/telemetry?charset=utf8mb4'
uv run alembic upgrade head
```

## MySQL / MariaDB 时间精度

`20260622_0008_ingest_records_mysql_microseconds.py` 将已有 MySQL/MariaDB
`ingest_records.occurred_at` 和 `received_at` 从默认秒级 `DATETIME` 调整为
`DATETIME(6)`，并把 `received_at` 默认值调整为 `CURRENT_TIMESTAMP(6)`。这样
trace、event、log 和 metric 查询的 `occurred_from` / `occurred_to` 可以按毫秒
或微秒边界精确比较，避免 `2026-06-22T01:00:00.075Z` 命中
`2026-06-22T01:00:00.100000Z`。

该迁移仅在 MySQL/MariaDB 方言下执行，SQLite 开发库会跳过；生成的语句使用
`ALTER TABLE ingest_records CHANGE ... DATETIME(6)` 和
`CURRENT_TIMESTAMP(6)`，兼容 Debian 常见 MySQL 8 与 MariaDB 包。回滚会恢复为
秒级 `DATETIME`，历史微秒部分会在数据库执行类型收窄时丢失，不建议在已接入毫秒
过滤语义后回滚。
