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

