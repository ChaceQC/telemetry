# 遥测后端

本目录是遥测平台后端服务，当前阶段提供 Python + uv + FastAPI 基础骨架、配置读取、健康检查接口、阶段 1 基础管理 API 的 SQLAlchemy 持久化基础，以及最小认证/当前用户依赖骨架。

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
| `DATABASE_URL` | `sqlite:///./telemetry-dev.db` | SQLAlchemy 数据库连接；MySQL 使用 `mysql+pymysql://...?...charset=utf8mb4` |
| `AUTH_SECRET_KEY` | 未设置 | JWT 签名密钥；未设置或少于 32 个 UTF-8 字节时认证接口返回 `503`，生产环境必须使用 32 字节以上随机密钥 |
| `AUTH_TOKEN_ALGORITHM` | `HS256` | JWT 签名算法 |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | 访问 token 有效期，单位分钟 |

示例：

```powershell
$env:BACKEND_PORT='28117'
uv run python main.py
```

## 数据库迁移

当前管理元数据已接入 SQLAlchemy 2.x、Alembic 和 PyMySQL。应用启动不会自动创建表，本地开发或部署前需要在 `backend` 目录执行迁移：

```powershell
uv run alembic upgrade head
```

默认 `DATABASE_URL` 使用本地 SQLite 文件，仅用于无 MySQL 运行时时的开发兜底和迁移链路验证。连接 MySQL 时示例：

```powershell
$env:DATABASE_URL='mysql+pymysql://telemetry:telemetry@127.0.0.1:3306/telemetry?charset=utf8mb4'
uv run alembic upgrade head
uv run python main.py
```

当前迁移创建以下表：

| 表 | 说明 | 关键约束 |
| --- | --- | --- |
| `management_projects` | 项目元数据 | `key` 全局唯一 |
| `management_environments` | 环境元数据 | 外键 `project_id`，同项目下 `key` 唯一，`(id, project_id)` 供服务复合外键引用 |
| `management_services` | 服务元数据 | 外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键约束环境归属，同环境下 `key` 唯一 |
| `auth_users` | 本地登录用户 | `username` 唯一，`email` 唯一且可为空，密码仅保存哈希 |

MySQL 表使用 `utf8mb4` 字符集和 `utf8mb4_unicode_ci` 排序规则。当前环境没有真实 MySQL 服务，因此已完成 SQLite 迁移升降级和 repository 单元测试；后续接入 MySQL 容器后需要补跑 MySQL migration、外键、唯一索引和 API 集成验证。

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

## 认证 API

当前认证基础使用本地 `auth_users` 表、`pwdlib[argon2]` 密码哈希和 `PyJWT` 访问 token。后端已提供可复用的 `get_current_user` 依赖，供后续管理 API、项目权限和 API Key 管理逐步接入；本次不强制改造既有管理 API 的权限要求。

接口不会在响应中返回 `password`、`password_hash` 或 token payload 详情。代码当前不输出请求体日志，后续引入结构化访问日志时也必须脱敏密码、token、cookie、API Key 和数据库连接串。

登录接口保持 JSON 请求体契约，不使用 OAuth2 password form。OpenAPI 对受保护接口仅声明 HTTP Bearer token；客户端应在请求头中传入 `Authorization: Bearer <access_token>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | 使用用户名和密码登录，返回 bearer access token |
| `GET` | `/api/v1/auth/me` | 读取当前访问 token 对应用户 |

登录请求示例：

```json
{
  "username": "admin",
  "password": "change-me"
}
```

登录响应示例：

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600
}
```

当前用户响应示例：

```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.test",
  "display_name": "管理员",
  "is_active": true,
  "is_superuser": true,
  "created_at": "2026-06-20T12:00:00Z"
}
```

错误边界：

| 状态码 | 场景 |
| --- | --- |
| `401` | 用户名或密码错误、token 缺失、token 无效、token 过期、token 对应用户不存在 |
| `403` | 后续权限依赖可用于表达已认证但无权限，本次尚未接入具体权限策略 |
| `503` | `AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节，认证服务不可用 |
| `422` | 请求体字段格式错误 |

登录失败统一返回 `用户名或密码错误`；账号不存在、密码错误和停用账号不会返回可区分文案。账号不存在时服务端仍执行固定 Argon2 dummy hash 校验，减少用户名枚举时序差异。当前没有开放用户注册或管理员创建用户 API；测试和后续初始化脚本可以通过 `SqlAlchemyAuthRepository.create_user()` 与 `hash_password()` 创建初始账号。后续用户管理、团队、角色和项目权限需在此基础上继续补齐。

## 基础管理 API

当前阶段提供项目、环境和服务管理接口，API 契约延续 T-0006；数据访问已从进程内内存仓储切换为请求级 SQLAlchemy repository。接口暂不接收密钥、Token、Cookie、数据库连接串或通知 Webhook 等敏感字段，也不输出请求体日志。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | 列出项目 |
| `POST` | `/api/v1/projects` | 创建项目 |
| `GET` | `/api/v1/environments` | 列出环境，可用 `project_id` 过滤 |
| `POST` | `/api/v1/environments` | 创建环境 |
| `GET` | `/api/v1/services` | 列出服务，可用 `project_id`、`environment_id` 过滤 |
| `POST` | `/api/v1/services` | 创建服务 |

通用字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 数据库自增 ID |
| `name` | string | 展示名称，1 到 100 字符 |
| `key` | string | 稳定标识，匹配 `^[a-z][a-z0-9_-]*$` |
| `description` | string/null | 描述，最多 500 字符 |
| `status` | string | `active`、`inactive` 或 `archived` |
| `created_at` | string | 服务端创建时间，ISO 8601 格式 |
| `project_id` | number | 环境和服务所属项目 ID |
| `environment_id` | number | 服务所属环境 ID |

当前实现位于 `app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`，由 `app/api/dependencies.py` 按请求注入数据库 session。服务创建同时在 service 层校验项目/环境归属，并由数据库 `(environment_id, project_id)` 复合外键兜底。`InMemoryManagementRepository` 仅保留给不连接数据库的局部单元测试；当前 API 测试使用 SQLite SQLAlchemy repository 验证契约和约束映射。当前仍未接入认证、权限和分页，后续阶段需要在保持现有响应契约基础上补齐。

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
  repositories/     # 数据访问层，管理 API 默认使用 SQLAlchemy repository；内存实现仅用于局部测试
  providers/        # 基础设施 provider
  adapters/         # 第三方系统 adapter
  tasks/            # 后台任务
  telemetry/        # 后端自身观测性
migrations/         # Alembic 数据库迁移
tests/              # pytest 测试
```

关键入口：

- `main.py`：本地启动入口，按配置启动 uvicorn。
- `app/core/config.py`：集中读取环境变量和 `VERSION`。
- `app/core/application.py`：FastAPI app factory。
- `app/db/base.py`：SQLAlchemy declarative base。
- `app/db/session.py`：SQLAlchemy engine 和 session factory。
- `app/api/router.py`：聚合 API 路由。
- `app/api/dependencies.py`：请求级数据库 session、管理服务、认证服务和当前用户依赖。
- `app/api/routes/auth.py`：登录和当前用户接口。
- `app/api/routes/health.py`：健康检查接口。
- `app/api/routes/management.py`：项目、环境、服务管理接口。
- `app/models/auth.py`：用户 ORM 模型。
- `app/models/management.py`：项目、环境、服务 ORM 模型。
- `app/schemas/auth.py`：认证 API 的 Pydantic 请求和响应模型。
- `app/schemas/management.py`：基础管理 API 的 Pydantic 请求和响应模型。
- `app/services/auth.py`：密码哈希、token 签发/解析和认证规则。
- `app/services/management.py`：基础管理业务规则和归属关系校验。
- `app/repositories/auth.py`：认证 repository 协议和 SQLAlchemy 实现。
- `app/repositories/management.py`：基础管理 repository 协议、SQLAlchemy 实现和测试用内存实现。
- `migrations/versions/20260620_0001_create_management_tables.py`：项目、环境、服务表迁移。
- `migrations/versions/20260620_0002_create_auth_users.py`：用户表迁移。

## 验证命令

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run alembic upgrade head
uv run python main.py
```

当前阶段尚未引入用户创建管理界面、团队/角色/项目权限、API Key、摄入、查询和告警逻辑，真实 MySQL 服务也尚未在本 worktree 启动。因此后端验证边界限定为配置读取、应用创建、健康检查契约、基础管理 API 契约、认证 API 契约、密码哈希、SQLite repository 约束、SQLite Alembic 升降级和代码静态检查；MySQL 容器补验需在后续任务完成。
