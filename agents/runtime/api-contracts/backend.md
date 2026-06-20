# 后端 API 契约草案

本文件由后端开发 agent 维护，供总 agent 汇总到 `AGENT_COMMUNICATION.md`。当前草案对应 `T-0020`：阶段 1 已将项目、环境和服务管理 API 接入项目级 RBAC 基础，并保留浏览器联调所需的 CORS、Trusted Host、root_path 和代理头配置入口。管理 API 需要有效 Bearer token 和启用用户；超级用户可访问全部资源，普通用户只能访问自己拥有项目角色的资源。

## 部署与浏览器访问配置

- 本地前端默认 origin：
  - `http://127.0.0.1:25173`
  - `http://localhost:25173`
  - `http://127.0.0.1:25174`
  - `http://localhost:25174`
- `APP_ENV=local` 或 `APP_ENV=test` 且未显式配置 `BACKEND_CORS_ALLOWED_ORIGINS` 时，后端默认允许上述本地 origin，浏览器 `OPTIONS /api/v1/auth/login` preflight 会返回 CORS 允许头，不再落到业务路由 405。
- 非本地环境默认 `BACKEND_CORS_ALLOWED_ORIGINS` 为空；生产必须显式配置真实 HTTPS origin，例如 `https://example.com`。CORS origin 只包含 scheme + host + port，不包含 `/xxx` 等路径。
- CORS 配置项：
  - `BACKEND_CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS`：逗号分隔 origin 白名单。
  - `BACKEND_CORS_ALLOWED_METHODS` / `CORS_ALLOWED_METHODS`：默认 `GET,POST,PUT,PATCH,DELETE,OPTIONS`。
  - `BACKEND_CORS_ALLOWED_HEADERS` / `CORS_ALLOWED_HEADERS`：默认 `Authorization,Content-Type,Accept,Origin`。
  - `BACKEND_CORS_ALLOW_CREDENTIALS` / `CORS_ALLOW_CREDENTIALS`：默认 `false`；当前 Bearer token 模式推荐保持关闭。开启时必须使用明确 origin 白名单，后端会拒绝与 `BACKEND_CORS_ALLOWED_ORIGINS=*` 同时配置。
- Trusted Host 配置项：
  - `BACKEND_TRUSTED_HOSTS` / `TRUSTED_HOSTS`：逗号分隔 Host 白名单。
  - 本地/测试默认 `localhost,127.0.0.1,[::1],testserver`；非本地默认仅保留 `localhost,127.0.0.1` 作为反代内侧兜底，生产必须显式加入公网域名和 Nginx 传给后端的 Host。
- root path / 子路径策略：
  - 推荐：前端位于 `https://example.com/xxx/` 时，API 仍暴露为 `https://example.com/api/v1/...`，后端 `BACKEND_ROOT_PATH` 保持空，前端配置 API base path 为 `/api/v1`。
  - 如必须暴露为 `https://example.com/xxx/api/v1/...`，后端设置 `BACKEND_ROOT_PATH=/xxx`，Nginx 公网入口匹配 `/xxx/api/v1/...` 后应剥离或映射 `/xxx` 前缀，再转发给后端实际路由 `/api/v1/...`；不要把 `/xxx` 原样留给后端路由匹配。OpenAPI servers 会声明 `{"url": "/xxx"}`。
- 代理头配置：
  - `BACKEND_PROXY_HEADERS` / `PROXY_HEADERS`：传给 uvicorn `proxy_headers`，默认 `false`。
  - `BACKEND_FORWARDED_ALLOW_IPS` / `FORWARDED_ALLOW_IPS`：传给 uvicorn `forwarded_allow_ips`，默认 `127.0.0.1`。
- 真实域名、证书路径、密钥、数据库连接串不得硬编码或提交，应由部署环境注入。

## API-0005 用户登录

- 方法：`POST`
- 路径：`/api/v1/auth/login`
- 权限：公开登录入口；需要数据库中已有启用用户。请求体保持 JSON，不使用 OAuth2 password form。
- 请求体：

```json
{
  "username": "admin",
  "password": "change-me"
}
```

- 字段规则：
  - `username`：必填，1 到 64 字符，首尾空白会裁剪。
  - `password`：必填，1 到 256 字符；仅用于校验，不写入响应，不应进入日志。
- 响应：`200 OK`

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600
}
```

- 响应字段：
  - `access_token`：JWT access token，payload 仅包含 `sub`、`iat`、`exp` 等最小必要 claim。
  - `token_type`：固定为 `bearer`。
  - `expires_in`：token 有效秒数，来自 `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`。
- 错误：
  - `401 Unauthorized`：用户名或密码错误；账号不存在、密码错误和停用账号统一返回同一错误，避免账号枚举。
  - `503 Service Unavailable`：`AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节。
  - `422 Unprocessable Entity`：请求体字段格式错误。
- 安全边界：账号不存在时服务端仍执行固定 Argon2 dummy hash 校验，减少用户名枚举时序差异。
- 敏感字段：请求中的 `password`、响应中的 `access_token` 不得写入应用日志、测试日志或 agent 运行日志。

## API-0006 当前用户

- 方法：`GET`
- 路径：`/api/v1/auth/me`
- 权限：需要 `Authorization: Bearer <access_token>`；OpenAPI 使用 HTTP Bearer security scheme，不声明 OAuth2 password flow。
- 请求体：无。
- 响应：`200 OK`

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

- 响应字段不包含 `password`、`password_hash`、token、cookie 或其他敏感凭据。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `503 Service Unavailable`：`AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节。

## 管理 API 通用认证与权限边界

- `GET/POST /api/v1/projects`、`GET/POST /api/v1/environments`、`GET/POST /api/v1/services` 均需要 `Authorization: Bearer <access_token>`。
- 最小认证要求：token 必须可验证、未过期，且 token 对应用户存在并处于启用状态。
- 项目级角色：`viewer`、`editor`、`admin`；角色层级为 `admin > editor > viewer`。
- 超级用户：`auth_users.is_superuser=true` 时绕过项目角色检查，可读取和管理全部项目资源。
- 普通用户读取：只能读取自己拥有 `viewer`、`editor` 或 `admin` 的项目资源。未指定筛选条件的列表接口会自动过滤为可访问项目；指定无权限 `project_id` 或仅指定无权限环境时返回 `403`。
- 普通用户创建项目：`POST /api/v1/projects` 成功后，创建者自动获得该项目 `admin` 角色；项目记录和创建者 `admin` 成员授权在同一事务内提交，授权写入失败会整体回滚。
- 环境/服务创建：`POST /api/v1/environments`、`POST /api/v1/services` 需要对应项目至少 `editor` 权限；`viewer` 会返回 `403`。
- 管理或危险动作：当前阶段只有创建环境/服务这类管理动作，保守要求 `editor/admin`；后续删除、成员管理、API Key 等危险动作应要求 `admin`。
- 通用认证错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证但缺少项目权限。
  - `503 Service Unavailable`：`AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节。

## API-0002 项目管理

- 方法：`GET`
- 路径：`/api/v1/projects`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 查询参数：暂无。
- 分页：暂无；当前 SQLAlchemy repository 返回全部项目，后续数据量上来后补 `page`、`page_size` 或游标分页。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "name": "核心平台",
    "key": "core-platform",
    "description": "主项目",
    "status": "active",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/projects`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 请求体：

```json
{
  "name": "核心平台",
  "key": "core-platform",
  "description": "主项目",
  "status": "active"
}
```

- 字段规则：
  - `name`：必填，1 到 100 字符，首尾空白会裁剪。
  - `key`：必填，2 到 64 字符，匹配 `^[a-z][a-z0-9_-]*$`，全局唯一。
  - `description`：可选，最多 500 字符。
  - `status`：可选，`active`、`inactive`、`archived`，默认 `active`。
- 响应：`201 Created`，返回创建后的项目对象。
- 错误：
  - `409 Conflict`：项目 `key` 已存在。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## API-0003 环境管理

- 方法：`GET`
- 路径：`/api/v1/environments`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下环境。
- 分页：暂无；当前 SQLAlchemy repository 返回全部匹配环境。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "project_id": 1,
    "name": "生产环境",
    "key": "prod",
    "description": null,
    "status": "active",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/environments`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 请求体：

```json
{
  "project_id": 1,
  "name": "生产环境",
  "key": "prod",
  "description": null,
  "status": "active"
}
```

- 字段规则：
  - `project_id`：必填，正整数，必须引用已存在项目。
  - `name`、`key`、`description`、`status`：同项目字段规则。
  - `key`：在同一个 `project_id` 下唯一。
- 响应：`201 Created`，返回创建后的环境对象。
- 错误：
  - `404 Not Found`：项目不存在。
  - `403 Forbidden`：缺少目标项目 `editor/admin` 权限。
  - `409 Conflict`：同项目下环境 `key` 已存在。
  - `409 Conflict`：其他无法归类为重复 key 或缺失项目的数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## API-0004 服务管理

- 方法：`GET`
- 路径：`/api/v1/services`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下服务。
  - `environment_id`：可选，正整数；传入后只返回该环境下服务。
- 分页：暂无；当前 SQLAlchemy repository 返回全部匹配服务。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "project_id": 1,
    "environment_id": 1,
    "name": "API 服务",
    "key": "api-service",
    "description": null,
    "status": "inactive",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/services`
- 权限：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用；按本节项目级 RBAC 执行。
- 请求体：

```json
{
  "project_id": 1,
  "environment_id": 1,
  "name": "API 服务",
  "key": "api-service",
  "description": null,
  "status": "active"
}
```

- 字段规则：
  - `project_id`：必填，正整数，必须引用已存在项目。
  - `environment_id`：必填，正整数，必须引用当前 `project_id` 下已存在环境。
  - `environment_id` 所属项目必须等于 `project_id`；若环境属于当前用户无权限的其他项目，接口统一返回环境不存在，不通过 `404/409` 暴露跨项目环境 ID 是否存在。
  - `name`、`key`、`description`、`status`：同项目字段规则。
  - `key`：在同一个 `environment_id` 下唯一。
- 响应：`201 Created`，返回创建后的服务对象。
- 错误：
  - `404 Not Found`：项目或当前项目下环境不存在；无权限跨项目环境 ID 也按环境不存在处理。
  - `403 Forbidden`：缺少目标项目 `editor/admin` 权限。
  - `409 Conflict`：环境所属项目不匹配，或同环境下服务 `key` 已存在。
  - `409 Conflict`：其他无法归类为重复 key、缺失项目/环境或归属冲突的数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## 持久化实现与迁移

- 当前实现位于 `backend/app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`。
- 认证实现位于 `backend/app/services/auth.py`、`backend/app/repositories/auth.py`、`backend/app/api/routes/auth.py`，默认使用 `SqlAlchemyAuthRepository`。
- 权限实现位于 `backend/app/services/permissions.py`、`backend/app/repositories/permissions.py` 和 `backend/app/schemas/permissions.py`；管理 service 统一调用 `PermissionService`，路由不散落角色判断。
- 请求级数据库 session 由 `backend/app/api/dependencies.py` 注入，engine/session factory 在 `backend/app/core/application.py` 创建。
- 配置项：`DATABASE_URL`，默认 `sqlite:///./telemetry-dev.db`；MySQL 使用 `mysql+pymysql://...?...charset=utf8mb4`。
- 认证配置项：
  - `AUTH_SECRET_KEY`：JWT 签名密钥；未配置或少于 32 个 UTF-8 字节时认证接口返回 `503`。
  - `AUTH_TOKEN_ALGORITHM`：默认 `HS256`。
  - `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`：默认 `60`。
- Alembic 迁移：
  - `backend/migrations/versions/20260620_0001_create_management_tables.py`
  - `backend/migrations/versions/20260620_0002_create_auth_users.py`
  - `backend/migrations/versions/20260620_0003_create_rbac_tables.py`
- MySQL 目标表：
  - `management_projects`：项目，`key` 全局唯一。
  - `management_environments`：环境，外键 `project_id`，同项目下 `key` 唯一，并提供 `(id, project_id)` 唯一约束供服务复合外键引用。
  - `management_services`：服务，外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键保证服务引用的环境属于同一项目，同环境下 `key` 唯一。
  - `auth_users`：本地登录用户，`username` 唯一，`email` 唯一且可为空，密码仅保存 `pwdlib[argon2]` 哈希。
  - `rbac_teams`：团队，`key` 全局唯一。
  - `rbac_team_members`：团队成员，外键 `team_id`、`user_id`，同团队同用户唯一。
  - `rbac_project_members`：项目成员角色，外键 `project_id`、`user_id`，同项目同用户唯一，`role` 取 `viewer`、`editor`、`admin`。
- 表字符集：MySQL `utf8mb4` / `utf8mb4_unicode_ci`。
- Repository 完整性错误映射：唯一约束按具体约束映射为重复 key；外键约束按缺失项目、缺失环境或服务项目/环境归属冲突映射；无法识别的 `IntegrityError` 返回通用数据库完整性冲突，不再伪装为重复 key。创建项目和创建者 `admin` 授权通过 service 层事务边界整体提交或整体回滚。
- 真实 MySQL 回归入口：`TELEMETRY_MYSQL_TEST_DATABASE_URL` 仅用于本地或专用测试环境，未设置时相关测试会 `skip`，不影响普通 CI。该 URL 需要可创建/删除数据库；测试会创建随机 `telemetry_test_<uuid>` 临时库、执行 Alembic `upgrade head`，并在结束后删除临时库。不得在日志、agent 记录或提交中输出真实连接串、密码或临时库详情。
- 验证边界：已用 SQLite 覆盖 API 契约、唯一约束错误映射、服务项目/环境复合外键归属约束、未知 `IntegrityError` 映射、密码非明文保存、登录成功/失败、未知用户 dummy hash 校验、未配置/弱/有效 `AUTH_SECRET_KEY`、HTTP Bearer OpenAPI 描述、当前用户依赖识别 token 用户、项目创建后创建者获得 `admin`、创建者授权失败时项目创建回滚、无权限跨项目环境 ID 不泄露且不能创建服务、未授权用户无法读取他人项目、`viewer` 只读、`editor` 可创建环境/服务、`admin`/superuser 可管理、停用用户被拒绝和 Alembic 升降级；真实 MySQL 回归测试覆盖项目创建授权事务回滚、跨项目 environment_id 非泄露和临时库清理，后续仍可继续扩展 migration、外键、唯一索引、用户唯一约束和 RBAC 约束的 MySQL 专项用例。
- 安全边界：认证接口接收密码并返回 token，但代码未输出请求体日志；后续结构化日志必须脱敏 `password`、`access_token`、`Authorization`、Cookie、数据库连接串、API Key 和通知 Webhook 密钥。当前尚未开放团队/成员管理或项目授权 API，后续需补管理员授权入口、审计日志和危险动作 `admin` 校验。
