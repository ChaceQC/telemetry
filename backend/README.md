# 遥测后端

本目录是遥测平台后端服务，当前阶段提供 Python + uv + FastAPI 基础骨架、配置读取、健康检查接口、阶段 1 基础管理 API 的 SQLAlchemy 持久化基础、认证/当前用户依赖、项目级 RBAC 基础、项目范围 API Key 创建/列表/撤销基础，以及浏览器联调所需的 CORS、Trusted Host、反向代理 root path 配置入口。

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
| `BACKEND_CORS_ALLOWED_ORIGINS` | 本地/测试环境默认 `http://127.0.0.1:25173,http://localhost:25173,http://127.0.0.1:25174,http://localhost:25174`，其他环境默认空 | 允许跨域访问后端的前端 origin，逗号分隔；生产必须显式配置为真实 HTTPS origin |
| `CORS_ALLOWED_ORIGINS` | 同上 | `BACKEND_CORS_ALLOWED_ORIGINS` 的兼容别名，优先级较低 |
| `BACKEND_CORS_ALLOWED_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | CORS 允许方法，逗号分隔 |
| `BACKEND_CORS_ALLOWED_HEADERS` | `Authorization,Content-Type,Accept,Origin` | CORS 允许请求头，逗号分隔 |
| `BACKEND_CORS_ALLOW_CREDENTIALS` | `false` | 是否允许跨域携带凭据；当前 bearer token 推荐保持 `false`，且为 `true` 时禁止将 CORS origin 配置为 `*` |
| `BACKEND_TRUSTED_HOSTS` | 本地/测试环境默认 `localhost,127.0.0.1,[::1],testserver`，其他环境默认 `localhost,127.0.0.1` | Trusted Host 白名单，逗号分隔；生产必须加入公网域名和反代传给后端的 Host |
| `TRUSTED_HOSTS` | 同上 | `BACKEND_TRUSTED_HOSTS` 的兼容别名，优先级较低 |
| `BACKEND_ROOT_PATH` | 空 | FastAPI `root_path`，仅在后端被挂载到反向代理子路径时设置，例如 `/xxx` |
| `ROOT_PATH` | 空 | `BACKEND_ROOT_PATH` 的兼容别名，优先级较低 |
| `BACKEND_PROXY_HEADERS` | `false` | 是否信任反向代理转发的 `X-Forwarded-*` 头；生产经 Nginx HTTPS 反代时建议开启 |
| `BACKEND_FORWARDED_ALLOW_IPS` | `127.0.0.1` | 允许设置转发头的代理来源 IP，传给 uvicorn `forwarded_allow_ips` |
| `DATABASE_URL` | `sqlite:///./telemetry-dev.db` | SQLAlchemy 数据库连接；MySQL 使用 `mysql+pymysql://...?...charset=utf8mb4` |
| `AUTH_SECRET_KEY` | 未设置 | JWT 签名密钥；未设置或少于 32 个 UTF-8 字节时认证接口返回 `503`，生产环境必须使用 32 字节以上随机密钥 |
| `AUTH_TOKEN_ALGORITHM` | `HS256` | JWT 签名算法 |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | 访问 token 有效期，单位分钟 |

示例：

```powershell
$env:BACKEND_PORT='28117'
uv run python main.py
```

## 浏览器联调与反向代理

本地前端默认从 `http://127.0.0.1:25173` 调用后端 `http://127.0.0.1:28117`。`APP_ENV=local` 或 `APP_ENV=test` 且未显式配置 `BACKEND_CORS_ALLOWED_ORIGINS` 时，后端默认允许项目约定的本地前端 origin，并处理 `OPTIONS /api/v1/auth/login` 等浏览器 preflight 请求。

非本地环境默认不开放 CORS origin，避免生产忘配白名单时意外放开跨域。生产部署至少应配置：

```powershell
$env:APP_ENV='production'
$env:BACKEND_CORS_ALLOWED_ORIGINS='https://example.com'
$env:BACKEND_TRUSTED_HOSTS='example.com'
$env:BACKEND_PROXY_HEADERS='true'
$env:BACKEND_FORWARDED_ALLOW_IPS='127.0.0.1'
```

如果同一域名下同时承载前端和 API，且浏览器请求最终 origin 为 `https://example.com`，CORS origin 只需要配置 scheme + host + port，不包含路径。
如需开启跨域凭据，必须配置明确 origin 白名单；后端会拒绝 `BACKEND_CORS_ALLOWED_ORIGINS=*` 与 `BACKEND_CORS_ALLOW_CREDENTIALS=true` 的组合。

### 子路径部署策略

推荐生产路径策略是：前端部署在 `https://example.com/xxx/` 时，API 仍由 Nginx 暴露为独立前缀，例如 `https://example.com/api/v1/...`，后端保持 `BACKEND_ROOT_PATH` 为空，前端通过配置使用 `/api/v1` 作为 API base path。

如果必须把整个后端挂到子路径，例如公网访问为 `https://example.com/xxx/api/v1/...`，则需要同时满足：

- 后端设置 `BACKEND_ROOT_PATH=/xxx`。
- Nginx 公网入口匹配 `/xxx/api/v1/...` 后，应剥离或映射 `/xxx` 前缀，转发给后端实际路由 `/api/v1/...`；不要把 `/xxx` 原样留给后端路由匹配。
- ASGI scope 使用 `root_path=/xxx`，OpenAPI、Swagger UI 和客户端生成工具以 `/xxx` 作为服务器前缀；实际接口路由仍是代码中的 `/api/v1/...`。

Nginx 应继续把 `Host`、`X-Forwarded-Proto`、`X-Forwarded-For` 等头转给后端，并确保 `BACKEND_TRUSTED_HOSTS` 包含公网域名。真实域名、证书路径和密钥不得提交到仓库，应通过环境变量或部署平台配置注入。

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
| `rbac_teams` | 团队元数据 | `key` 全局唯一，当前作为团队能力基础表 |
| `rbac_team_members` | 团队成员 | 外键 `team_id`、`user_id`，同团队同用户唯一 |
| `rbac_project_members` | 项目成员角色 | 外键 `project_id`、`user_id`，同项目同用户唯一，角色为 `viewer`、`editor`、`admin` |
| `api_keys` | 项目 API Key | 外键 `project_id`、`created_by_user_id`，`key_hash` 全局唯一；只保存哈希和展示前缀，不保存明文 key |

MySQL 表使用 `utf8mb4` 字符集和 `utf8mb4_unicode_ci` 排序规则。当前环境没有真实 MySQL 服务，因此已完成 SQLite 迁移升降级和 repository 单元测试；后续接入 MySQL 容器后需要补跑 MySQL migration、外键、唯一索引和 API 集成验证。

### 真实 MySQL 回归测试

默认测试不要求 MySQL，未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 时真实 MySQL 用例会 `skip`，不会影响普通本地或 CI 的 `uv run pytest`。如本机或测试环境已有可创建/删除数据库的 MySQL 账号，可在 `backend` 目录临时设置：

```powershell
$env:TELEMETRY_MYSQL_TEST_DATABASE_URL='mysql+pymysql://user:password@127.0.0.1:3306/mysql?charset=utf8mb4'
uv run pytest tests/test_management_api.py
```

测试会基于该连接创建随机 `telemetry_test_<uuid>` 临时库，执行 Alembic `upgrade head`，跑完后删除临时库。不要在命令输出、日志或提交内容中记录真实连接串、密码或临时库详情；该环境变量只用于本地/专用测试环境复验，不应配置到默认 CI。

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

当前认证基础使用本地 `auth_users` 表、`pwdlib[argon2]` 密码哈希和 `PyJWT` 访问 token。后端已提供可复用的 `get_current_user` 依赖，并已将项目、环境和服务管理 API 接入项目级 RBAC 基础：请求必须携带有效 Bearer token，且 token 对应用户必须处于启用状态；普通用户还需要对应项目角色，超级用户可绕过项目角色检查。

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
| `403` | 已认证但缺少项目权限，例如普通用户访问未授权项目，或 `viewer` 尝试创建环境/服务 |
| `503` | `AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节，认证服务不可用 |
| `422` | 请求体字段格式错误 |

登录失败统一返回 `用户名或密码错误`；账号不存在、密码错误和停用账号不会返回可区分文案。账号不存在时服务端仍执行固定 Argon2 dummy hash 校验，减少用户名枚举时序差异。当前没有开放用户注册或管理员创建用户 API；测试和后续初始化脚本可以通过 `SqlAlchemyAuthRepository.create_user()` 与 `hash_password()` 创建初始账号。用户管理、团队管理和角色分配 API 仍需后续补齐。

## 基础管理 API

当前阶段提供项目、环境和服务管理接口，API 契约延续 T-0006；数据访问已从进程内内存仓储切换为请求级 SQLAlchemy repository。接口暂不接收密钥、Token、Cookie、数据库连接串或通知 Webhook 等敏感字段，也不输出请求体日志。

以下管理接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。项目级 RBAC 已接入服务层，超级用户可访问和管理全部项目；普通用户只能读取自己拥有项目权限的资源。创建项目时，项目记录和创建者 `admin` 成员授权在同一事务内提交，任一写入失败都会整体回滚。

项目角色当前定义：

| 角色 | 权限 |
| --- | --- |
| `viewer` | 可读取项目、环境和服务，不能创建环境或服务 |
| `editor` | 包含 `viewer`，可创建环境和服务 |
| `admin` | 包含 `editor`，当前可管理项目内环境和服务，后续危险动作和成员管理继续要求 `admin` |

当前 API 尚未开放团队管理、成员授权或项目成员管理接口；`rbac_teams`、`rbac_team_members` 和 `rbac_project_members` 已作为后续管理接口的数据基础。测试和初始化脚本可通过 `SqlAlchemyPermissionRepository.add_project_member()` 写入项目成员角色。

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

当前实现位于 `app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`，由 `app/api/dependencies.py` 按请求注入数据库 session。项目权限判断集中在 `app/services/permissions.py` 和 `app/repositories/permissions.py`，管理路由不直接散落角色判断。服务创建先按 `(environment_id, project_id)` 校验环境归属；对无权限跨项目环境统一按环境不存在处理，避免通过 `404/409` 探测其他项目环境 ID；用户对两个相关项目都有权限时仍保留归属不匹配的 `409` 业务错误。数据库 `(environment_id, project_id)` 复合外键继续兜底。`InMemoryManagementRepository` 仅保留给不连接数据库的局部单元测试；当前 API 测试使用 SQLite SQLAlchemy repository 验证契约和约束映射。当前仍未接入分页，后续阶段需要在保持现有响应契约基础上补齐。

## API Key 管理 API

当前阶段提供项目范围 API Key 创建、列表和撤销接口，用于后续摄入 API 鉴权。所有 API Key 管理接口都需要 `Authorization: Bearer <access_token>`，且用户必须拥有目标项目 `admin` 角色；普通用户未处于目标项目权限范围内时与项目不存在一样返回 `404 项目不存在`，避免通过 API Key 管理端点枚举 `project_id`；已在项目内但不是 `admin` 的 `viewer`、`editor` 返回 `403`，超级用户可管理全部项目。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/projects/{project_id}/api-keys` | 列出项目 API Key 元数据 |
| `POST` | `/api/v1/projects/{project_id}/api-keys` | 创建项目 API Key，响应仅这一次包含明文 `api_key` |
| `POST` | `/api/v1/projects/{project_id}/api-keys/{api_key_id}/revoke` | 撤销项目 API Key，撤销后摄入校验入口返回无效 |

创建请求体：

```json
{
  "name": "生产摄入"
}
```

创建响应示例：

```json
{
  "id": 1,
  "project_id": 1,
  "name": "生产摄入",
  "key_prefix": "tlm_xxxxxxxx",
  "status": "active",
  "created_by_user_id": 1,
  "created_at": "2026-06-21T00:00:00Z",
  "revoked_at": null,
  "last_used_at": null,
  "api_key": "tlm_<仅创建响应返回一次>"
}
```

列表和撤销响应不包含 `api_key` 或 `key_hash`。数据库只保存 `key_hash`、`key_prefix` 和元数据；当前哈希为高熵随机 token 的 SHA-256 摘要，明文 key 不写入数据库、README、运行日志或测试日志。`ApiKeyService.verify_key(raw_key)` 已作为后续摄入 API 鉴权入口：有效且未撤销时返回 `api_key_id`、`project_id` 和 `key_prefix`，并更新 `last_used_at`；撤销或不存在时返回 `None`。

错误边界：

| 状态码 | 场景 |
| --- | --- |
| `401` | 缺少或无效 Bearer token |
| `403` | 已认证且处于目标项目权限范围内，但不是目标项目 `admin` |
| `404` | 项目不存在、普通用户不在目标项目权限范围内，或撤销的 API Key 不属于该项目/不存在 |
| `409` | API Key 数据库完整性约束错误 |
| `422` | 请求体字段或路径参数格式错误 |

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
- `app/api/routes/api_keys.py`：项目 API Key 创建、列表和撤销接口。
- `app/api/routes/health.py`：健康检查接口。
- `app/api/routes/management.py`：项目、环境、服务管理接口。
- `app/models/api_keys.py`：API Key ORM 模型。
- `app/models/auth.py`：用户 ORM 模型。
- `app/models/management.py`：项目、环境、服务 ORM 模型。
- `app/schemas/auth.py`：认证 API 的 Pydantic 请求和响应模型。
- `app/schemas/api_keys.py`：API Key API 的 Pydantic 请求和响应模型。
- `app/schemas/management.py`：基础管理 API 的 Pydantic 请求和响应模型。
- `app/schemas/permissions.py`：项目角色枚举和角色层级判断。
- `app/services/auth.py`：密码哈希、token 签发/解析和认证规则。
- `app/services/api_keys.py`：API Key 生成、哈希、权限校验、撤销和后续摄入校验入口。
- `app/services/management.py`：基础管理业务规则和归属关系校验。
- `app/services/permissions.py`：项目级权限判断入口，包含超级用户绕过和角色校验。
- `app/repositories/auth.py`：认证 repository 协议和 SQLAlchemy 实现。
- `app/repositories/api_keys.py`：API Key repository 协议和 SQLAlchemy 实现。
- `app/repositories/management.py`：基础管理 repository 协议、SQLAlchemy 实现和测试用内存实现。
- `app/repositories/permissions.py`：项目成员角色 repository 协议和 SQLAlchemy 实现。
- `migrations/versions/20260620_0001_create_management_tables.py`：项目、环境、服务表迁移。
- `migrations/versions/20260620_0002_create_auth_users.py`：用户表迁移。
- `migrations/versions/20260620_0003_create_rbac_tables.py`：团队、团队成员、项目成员角色表迁移。
- `migrations/versions/20260621_0004_create_api_keys.py`：API Key 表迁移。

## 验证命令

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run alembic upgrade head
uv run python main.py
```

当前阶段尚未引入用户创建管理界面、团队/成员管理 API、项目成员授权 API、摄入路由、查询和告警逻辑，真实 MySQL 服务也尚未在本 worktree 启动。因此后端验证边界限定为配置读取、应用创建、健康检查契约、基础管理 API 契约、认证 API 契约、密码哈希、项目级 RBAC 判断、API Key 明文只返回一次且不入库、撤销后 `verify_key()` 失效、API Key 管理端点对无项目权限普通用户隐藏项目存在性、创建项目与创建者授权事务回滚、跨项目环境 ID 非泄露、SQLite repository 约束、SQLite Alembic 升降级和代码静态检查；MySQL 容器补验需在后续任务完成。
