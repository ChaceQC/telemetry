# 遥测后端

本目录是遥测平台后端服务，当前阶段提供 Python + uv + FastAPI 基础骨架、配置读取和健康检查接口。

## 环境要求

- Python 3.12+
- uv

## 本地启动

在 `backend` 目录执行：

```powershell
uv run python main.py
```

默认监听端口来自环境变量，未设置时使用项目约定端口 `28117`。

常用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BACKEND_PORT` | `28117` | 后端 HTTP 监听端口 |
| `PORT` | `28117` | 兼容部署平台的端口变量，优先级低于 `BACKEND_PORT` |
| `BACKEND_HOST` | `127.0.0.1` | 后端监听地址 |
| `APP_ENV` | `local` | 运行环境标识 |
| `APP_NAME` | `telemetry-backend` | 应用名称 |
| `APP_VERSION` | 读取 `VERSION` | 应用版本 |
| `BACKEND_RELOAD` | `false` | 是否启用 uvicorn reload |
| `LOG_LEVEL` | `info` | uvicorn 日志级别 |

示例：

```powershell
$env:BACKEND_PORT='28117'
uv run python main.py
```

## 健康检查

```http
GET /health
```

当前接口不需要认证、请求体或查询参数，用于本地开发、容器编排和反向代理的基础可用性探测。

响应示例：

```json
{
  "status": "ok",
  "service": "telemetry-backend",
  "version": "0.1.0",
  "environment": "local",
  "port": 28117
}
```

字段契约：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 固定为 `ok` |
| `service` | string | 当前服务名，默认 `telemetry-backend` |
| `version` | string | 当前后端版本，默认读取 `backend/VERSION` |
| `environment` | string | 当前运行环境，来自 `APP_ENV` |
| `port` | number | 当前后端监听端口 |

## 目录结构

```text
app/
  api/              # API 路由和接口入口
  core/             # 配置读取、应用工厂等核心能力
  db/               # 数据库连接和迁移入口
  ingest/           # 遥测数据摄入模块
  query/            # 遥测数据查询模块
  alerts/           # 告警模块
  workers/          # 后台 worker
  models/           # 持久化模型
  schemas/          # Pydantic DTO
  services/         # 业务服务层
  repositories/     # 数据访问层
  providers/        # 基础设施 provider
  adapters/         # 第三方系统 adapter
  tasks/            # 后台任务
  telemetry/        # 后端自身观测性
tests/              # pytest 测试
```

关键入口：

- `main.py`：本地启动入口，按配置启动 uvicorn。
- `app/core/config.py`：集中读取环境变量和 `VERSION`。
- `app/core/application.py`：FastAPI app factory。
- `app/api/router.py`：聚合 API 路由。
- `app/api/routes/health.py`：健康检查接口。

## 验证命令

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run python main.py
```

当前阶段尚未引入数据库迁移、认证、摄入、查询和告警逻辑，因此后端验证边界限定为配置读取、应用创建、健康检查契约、代码静态检查和本地启动探针。
