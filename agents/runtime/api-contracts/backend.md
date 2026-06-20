# 后端 API 契约草案

本文件由后端开发 agent 维护，供总 agent 汇总到 `AGENT_COMMUNICATION.md`。当前草案对应 `T-0027`：阶段 1 已将项目、环境和服务管理 API 接入项目级 RBAC 基础，并新增项目范围 API Key 创建、列表、撤销；阶段 2 已提供 events、metrics 和 logs 摄入 API 基础，并使用 API Key 作为上报鉴权入口；ClickHouse/MongoDB 开发容器初始化基础已补齐，摄入 API Key 限流支持内存和 Redis 固定窗口后端，摄入统计可按项目查询。管理 API 需要有效 Bearer token 和启用用户；超级用户可访问全部资源，普通用户只能访问自己拥有项目角色的资源。

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
  - `BACKEND_CORS_ALLOWED_HEADERS` / `CORS_ALLOWED_HEADERS`：默认 `Authorization,X-API-Key,Content-Type,Accept,Origin`。
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
- ClickHouse 本地开发配置：
  - `CLICKHOUSE_HOST`：默认 `127.0.0.1`，只绑定本机。
  - `CLICKHOUSE_HTTP_PORT`：默认 `28123`，映射容器 `8123`。
  - `CLICKHOUSE_NATIVE_PORT`：默认 `29001`，映射容器 `9000`。
  - `CLICKHOUSE_DATABASE`：默认 `telemetry`。
  - `CLICKHOUSE_USER`：默认 `telemetry_app`。
  - `CLICKHOUSE_PASSWORD`：`.env.example` 仅使用 `change-me` 占位；真实环境必须由环境变量或密钥管理注入，不得提交真实密码。
- 项目根目录的 `docker-compose.dev.yml` 当前定义本地 MySQL、ClickHouse、MongoDB 和 Redis 开发服务；ClickHouse 初始化文件为 `backend/docker/clickhouse/init/01-create-telemetry-tables.sql`，挂载到 `/docker-entrypoint-initdb.d/01-create-telemetry-tables.sql`。compose 静态验证命令为 `docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet`，不启动容器。
- MongoDB 初始化文件为 `docker/mongodb/init-app-user.js`，挂载到 `/docker-entrypoint-initdb.d/10-init-app-user.js`；脚本创建应用读写用户，并初始化 `events` 集合和项目/环境/服务/时间、事件类型/时间、可选 TTL 索引。
- 摄入限流配置：
  - `INGEST_RATE_LIMIT_ENABLED`：默认 `false`；开启后按已验证 API Key ID 做固定窗口限流。
  - `INGEST_RATE_LIMIT_PER_MINUTE`：默认 `600`；超限返回 `429 Too Many Requests`、`detail=摄入请求过于频繁` 和 `Retry-After` 秒数。
  - `INGEST_RATE_LIMIT_BACKEND`：默认 `memory`；支持 `memory` 和 `redis`，多实例部署应使用 `redis`。
  - `INGEST_RATE_LIMIT_KEY_PREFIX`：默认 `telemetry`，Redis 限流 key 前缀。
  - `REDIS_URL`：默认 `redis://127.0.0.1:26380/0`；启用 Redis 限流后端时使用。
  - Redis 限流后端不可用时返回 `503 Service Unavailable`、`detail=摄入限流服务不可用`。

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

- `GET/POST /api/v1/projects`、`GET/POST /api/v1/environments`、`GET/POST /api/v1/services`、`GET/POST /api/v1/projects/{project_id}/api-keys` 和 `POST /api/v1/projects/{project_id}/api-keys/{api_key_id}/revoke` 均需要 `Authorization: Bearer <access_token>`。
- 最小认证要求：token 必须可验证、未过期，且 token 对应用户存在并处于启用状态。
- 项目级角色：`viewer`、`editor`、`admin`；角色层级为 `admin > editor > viewer`。
- 超级用户：`auth_users.is_superuser=true` 时绕过项目角色检查，可读取和管理全部项目资源。
- 普通用户读取：只能读取自己拥有 `viewer`、`editor` 或 `admin` 的项目资源。未指定筛选条件的列表接口会自动过滤为可访问项目；指定无权限 `project_id` 或仅指定无权限环境时返回 `403`。
- 普通用户创建项目：`POST /api/v1/projects` 成功后，创建者自动获得该项目 `admin` 角色；项目记录和创建者 `admin` 成员授权在同一事务内提交，授权写入失败会整体回滚。
- 环境/服务创建：`POST /api/v1/environments`、`POST /api/v1/services` 需要对应项目至少 `editor` 权限；`viewer` 会返回 `403`。
- 管理或危险动作：创建环境/服务要求 `editor/admin`；API Key 创建、列表和撤销要求目标项目 `admin`；后续删除、成员管理等危险动作也应要求 `admin`。
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

## API-0007 项目 API Key 管理

- 方法：`GET`
- 路径：`/api/v1/projects/{project_id}/api-keys`
- 权限：需要 `Authorization: Bearer <access_token>`，且用户必须拥有目标项目 `admin`；超级用户绕过项目成员检查。普通用户未处于目标项目权限范围内时与项目不存在一样返回 `404 项目不存在`，避免通过 API Key 管理端点枚举 `project_id`；已在项目内但不是 `admin` 的 `viewer`、`editor` 返回 `403`。
- 查询参数：暂无。
- 分页：暂无；当前 SQLAlchemy repository 返回项目下全部 API Key 元数据。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "project_id": 1,
    "name": "生产摄入",
    "key_prefix": "tlm_xxxxxxxx",
    "status": "active",
    "created_by_user_id": 1,
    "created_at": "2026-06-21T00:00:00Z",
    "revoked_at": null,
    "last_used_at": null
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/projects/{project_id}/api-keys`
- 权限：同上，必须是目标项目 `admin` 或 superuser。
- 请求体：

```json
{
  "name": "生产摄入"
}
```

- 字段规则：
  - `name`：必填，1 到 100 字符，首尾空白会裁剪。
- 响应：`201 Created`，返回创建后的 API Key 元数据和一次性明文 `api_key`。

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

- 方法：`POST`
- 路径：`/api/v1/projects/{project_id}/api-keys/{api_key_id}/revoke`
- 权限：同上，必须是目标项目 `admin` 或 superuser。
- 请求体：无。
- 响应：`200 OK`，返回撤销后的 API Key 元数据，不包含明文。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证且处于目标项目权限范围内，但缺少目标项目 `admin` 权限。
  - `404 Not Found`：项目不存在、普通用户不在目标项目权限范围内，或撤销的 API Key 不属于该项目/不存在。
  - `409 Conflict`：API Key 数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段或路径参数格式错误。
- 安全边界：
  - 明文 API Key 仅在创建响应的 `api_key` 字段返回一次；列表、撤销响应和数据库均不包含明文。
  - 数据库只保存 `key_hash`、`key_prefix` 和元数据；`key_hash` 为高熵随机 token 的 SHA-256 摘要，当前不保存可逆密文。
  - 文档、测试和日志不得写入真实明文 API Key；示例必须使用占位符。
  - API Key 管理端点不会先对任意认证用户暴露项目存在性；普通用户没有目标项目成员关系时，列表、创建、撤销均返回与项目不存在一致的 `404 项目不存在`。
  - `ApiKeyService.verify_key(raw_key)` 是后续摄入 API 的鉴权入口：有效且未撤销时返回 `api_key_id`、`project_id`、`key_prefix` 并更新 `last_used_at`；不存在或已撤销时返回 `None`。

## API-0008 数据摄入

- 方法：`POST`
- 路径：`/api/v1/ingest/events`
- 权限：需要项目 API Key，不接受登录 JWT。支持 `Authorization: Bearer <api_key>` 或 `X-API-Key: <api_key>`；两者同时存在时优先使用 `Authorization`。服务端调用 `ApiKeyService.verify_key(raw_key)`，有效且未撤销时取得 `api_key_id` 与 `project_id`，无效、缺失或已撤销时返回 `401`。
- 请求体：

```json
{
  "type": "deployment",
  "source": "ci",
  "timestamp": "2026-06-21T00:00:00Z",
  "payload": {
    "version": "1.2.3",
    "status": "ok"
  }
}
```

- 字段规则：
  - `type`：必填，1 到 128 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$`。
  - `source`：可选，最长 128 字符。
  - `timestamp`：可选，ISO 8601 时间；入库为 `occurred_at`。
  - `payload`：必填对象，单事件 JSON 序列化后不超过 64 KiB。
  - 顶层额外字段会返回 `422`；客户端不能通过顶层 `project_id` 指定或覆盖项目归属。
- 响应：`202 Accepted`

```json
{
  "id": 1,
  "project_id": 1,
  "kind": "event",
  "type": "deployment",
  "received_at": "2026-06-21T00:00:00Z"
}
```

- 方法：`POST`
- 路径：`/api/v1/ingest/batch`
- 权限：同 `/api/v1/ingest/events`。
- 请求体：

```json
{
  "events": [
    {"type": "deploy.started", "payload": {"id": "d-1"}},
    {"type": "deploy.finished", "payload": {"id": "d-1", "ok": true}}
  ]
}
```

- 字段规则：
  - `events`：必填数组，至少 1 条、最多 100 条。
  - 单条事件规则同 `/api/v1/ingest/events`。
  - 批量 JSON 序列化后不超过 256 KiB。
- 响应：`202 Accepted`

```json
{
  "accepted_count": 2,
  "receipts": [
    {
      "id": 1,
      "project_id": 1,
      "kind": "event",
      "type": "deploy.started",
      "received_at": "2026-06-21T00:00:00Z"
    }
  ]
}
```

- 错误：
  - `401 Unauthorized`：缺少 API Key、API Key 无效或已撤销。
  - `422 Unprocessable Entity`：请求体字段格式错误、出现额外字段、缺失 payload、payload 超限、payload 含非有限数值或批量条数/大小超限。

- 方法：`POST`
- 路径：`/api/v1/ingest/metrics`
- 权限：同 `/api/v1/ingest/events`。
- 请求体：

```json
{
  "metrics": [
    {
      "name": "http.server.duration",
      "value": 12.5,
      "timestamp": "2026-06-21T00:00:00Z",
      "unit": "ms",
      "type": "histogram",
      "source": "api",
      "tags": {
        "route": "/health"
      },
      "payload": {
        "bucket": "p95"
      }
    }
  ]
}
```

- 字段规则：
  - `metrics`：必填数组，至少 1 条、最多 100 条，整体 JSON 序列化后不超过 256 KiB。
  - `name`：必填，1 到 128 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$`。
  - `value`：必填，有限数值；`NaN`、`Infinity`、`-Infinity` 返回 `422`。
  - `timestamp`：可选，ISO 8601 时间；入库为 `occurred_at`。
  - `unit`：可选，最长 32 字符。
  - `type`：可选，最长 64 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$`。
  - `source`：可选，最长 128 字符。
  - `tags`、`payload`：可选对象，任意层级不得包含非有限数值。
  - 顶层额外字段会返回 `422`；客户端不能通过顶层 `project_id` 指定或覆盖项目归属。
- 响应：`202 Accepted`，格式同 batch receipt；receipt 中 `kind` 为 `metric`，`type` 为指标 `name`。

- 方法：`POST`
- 路径：`/api/v1/ingest/logs`
- 权限：同 `/api/v1/ingest/events`。
- 请求体：

```json
{
  "logs": [
    {
      "level": "info",
      "message": "deployment finished",
      "timestamp": "2026-06-21T00:00:00Z",
      "logger": "deploy.worker",
      "source": "worker",
      "trace_id": "trace-1",
      "span_id": "span-1",
      "attributes": {
        "service": "api"
      },
      "payload": {
        "duration_ms": 42
      }
    }
  ]
}
```

- 字段规则：
  - `logs`：必填数组，至少 1 条、最多 100 条，整体 JSON 序列化后不超过 256 KiB。
  - `level`：必填，1 到 32 字符，匹配 `^[A-Za-z][A-Za-z0-9._:-]*$`。
  - `message`：必填，1 到 8192 字符。
  - `timestamp`：可选，ISO 8601 时间；入库为 `occurred_at`。
  - `logger`、`source`、`trace_id`、`span_id`：可选，最长 128 字符。
  - `attributes`、`payload`：可选对象，任意层级不得包含非有限数值。
  - 顶层额外字段会返回 `422`；客户端不能通过顶层 `project_id` 指定或覆盖项目归属。
- 响应：`202 Accepted`，格式同 batch receipt；receipt 中 `kind` 为 `log`，`type` 为日志 `level`。
- 错误：
  - `401 Unauthorized`：缺少 API Key、API Key 无效或已撤销。
  - `429 Too Many Requests`：启用摄入限流且当前 API Key 超过固定窗口阈值，响应包含 `Retry-After`。
  - `503 Service Unavailable`：启用 Redis 限流后端且 Redis 连接或命令不可用。
  - `422 Unprocessable Entity`：请求体字段格式错误、出现额外字段、缺失必填字段、payload/tags/attributes 超限或含非有限数值、metrics value 非有限数值、logs message 超长或批量条数/大小超限。
- 持久化：当前写入 MySQL/SQLite `ingest_records` 表，字段包含 `project_id`、`api_key_id`、`kind`、`event_type`、`source`、`payload` JSON、`occurred_at`、`received_at`。events 写入 `kind=event` 且 `event_type=type`；metrics 写入 `kind=metric` 且 `event_type=name`；logs 写入 `kind=log` 且 `event_type=level`。
- 安全边界：
  - 项目归属只来自 API Key 校验结果，不接受客户端顶层 `project_id`。
  - 若 `project_id` 出现在 `payload`、`tags` 或 `attributes` 内，仅作为业务载荷保存，不影响归属。
  - 应用当前不输出请求体日志；后续结构化日志必须脱敏 `Authorization`、`X-API-Key` 和 payload 中可能存在的敏感字段。
  - 当前尚未实现审计日志、traces 专用 schema 或 ClickHouse/MongoDB 写入。

## API-0013 摄入统计查询

- `GET /api/v1/ingest/stats`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目，无权项目返回 `404`。
  - `kind`：可选，`event`、`metric` 或 `log`。
  - `limit`：可选，默认 `100`，范围 `1..500`。
- 响应：数组，每项包含 `bucket_start`、`project_id`、`api_key_id`、`kind`、`source`、`accepted_count`、`rejected_count`、`bytes_count`。
- 当前统计来源：关系库 `ingest_stats` 按分钟桶、项目、API Key、kind 和 source 聚合；当前仅成功摄入路径累加 `accepted_count` 和 `bytes_count`，`rejected_count`、ClickHouse `ingest_stats` 写入和更完整后台聚合查询后续补齐。

## 持久化实现与迁移

- 当前实现位于 `backend/app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`。
- 认证实现位于 `backend/app/services/auth.py`、`backend/app/repositories/auth.py`、`backend/app/api/routes/auth.py`，默认使用 `SqlAlchemyAuthRepository`。
- API Key 实现位于 `backend/app/services/api_keys.py`、`backend/app/repositories/api_keys.py`、`backend/app/api/routes/api_keys.py`，默认使用 `SqlAlchemyApiKeyRepository`。
- 摄入实现位于 `backend/app/services/ingest.py`、`backend/app/repositories/ingest.py`、`backend/app/api/routes/ingest.py`，默认使用 `SqlAlchemyIngestRepository`。
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
  - `backend/migrations/versions/20260621_0004_create_api_keys.py`
  - `backend/migrations/versions/20260621_0005_create_ingest_records.py`
  - `backend/migrations/versions/20260621_0006_create_ingest_stats.py`
- MySQL 目标表：
  - `management_projects`：项目，`key` 全局唯一。
  - `management_environments`：环境，外键 `project_id`，同项目下 `key` 唯一，并提供 `(id, project_id)` 唯一约束供服务复合外键引用。
  - `management_services`：服务，外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键保证服务引用的环境属于同一项目，同环境下 `key` 唯一。
  - `auth_users`：本地登录用户，`username` 唯一，`email` 唯一且可为空，密码仅保存 `pwdlib[argon2]` 哈希。
  - `rbac_teams`：团队，`key` 全局唯一。
  - `rbac_team_members`：团队成员，外键 `team_id`、`user_id`，同团队同用户唯一。
  - `rbac_project_members`：项目成员角色，外键 `project_id`、`user_id`，同项目同用户唯一，`role` 取 `viewer`、`editor`、`admin`。
  - `api_keys`：项目 API Key，外键 `project_id`、`created_by_user_id`，`key_hash` 全局唯一，保存 `status`、`revoked_at`、`last_used_at` 和展示前缀。
  - `ingest_records`：最小摄入记录，外键 `project_id`、`api_key_id`，保存 `kind`、`event_type`、`source`、`payload` JSON、`occurred_at` 和 `received_at`。
  - `ingest_stats`：摄入统计聚合，外键 `project_id`、`api_key_id`，按 `bucket_start`、`project_id`、`api_key_id`、`kind`、`source` 唯一聚合，保存 accepted/rejected 计数和 payload 字节数。
- 表字符集：MySQL `utf8mb4` / `utf8mb4_unicode_ci`。
- ClickHouse 初始化表：
  - `metric_samples`：MergeTree，按 `toDate(timestamp)` 分区，排序键 `(project_id, name, timestamp)`；保存 `project_id`、`api_key_id`、`timestamp`、`received_at`、`name`、`value`、`unit`、`metric_type`、`source`、`tags_json`、`attributes_json`、`payload_json`。
  - `log_records`：MergeTree，按 `toDate(timestamp)` 分区，排序键 `(project_id, level, source, timestamp)`；保存 `project_id`、`api_key_id`、`timestamp`、`received_at`、`level`、`source`、`logger`、`trace_id`、`span_id`、`message`、`attributes_json`、`payload_json`。
  - `ingest_stats`：MergeTree，按 `toDate(bucket_start)` 分区，排序键 `(project_id, bucket_start, kind, source)`；保存摄入统计时间桶、项目/API Key、kind、source、accepted/rejected 数、字节数、reason 和 `attributes_json`。
  - `trace_spans`：MergeTree 预留表，按 `toDate(start_time)` 分区，排序键 `(project_id, trace_id, start_time, name)`；保存 trace/span 标识、parent span、名称、起止时间、耗时、状态、source 和 JSON 字符串载荷。
- MongoDB 初始化集合：
  - `events`：保存结构变化较大的原始事件、业务遥测和扩展属性；初始化脚本不加 schema validator，保留灵活文档模型。
  - `idx_events_project_occurred_at`：`{ project_id: 1, occurred_at: -1 }`，支持项目内按事件时间查询。
  - `idx_events_project_env_service_time`：`{ project_id: 1, environment_id: 1, service_id: 1, occurred_at: -1 }`，支持项目/环境/服务组合查询。
  - `idx_events_type_occurred_at`：`{ event_type: 1, occurred_at: -1 }`，支持按事件类型查询。
  - `idx_events_expires_at_ttl`：`{ expires_at: 1 }`，`expireAfterSeconds=0` 且 `sparse=true`，用于可选临时事件过期清理。
- Repository 完整性错误映射：唯一约束按具体约束映射为重复 key；外键约束按缺失项目、缺失环境或服务项目/环境归属冲突映射；无法识别的 `IntegrityError` 返回通用数据库完整性冲突，不再伪装为重复 key。创建项目和创建者 `admin` 授权通过 service 层事务边界整体提交或整体回滚。
- 真实 MySQL 回归入口：`TELEMETRY_MYSQL_TEST_DATABASE_URL` 仅用于本地或专用测试环境，未设置时相关测试会 `skip`，不影响普通 CI。该 URL 需要可创建/删除数据库；测试会创建随机 `telemetry_test_<uuid>` 临时库、执行 Alembic `upgrade head`，并在结束后删除临时库。不得在日志、agent 记录或提交中输出真实连接串、密码或临时库详情。
- 验证边界：已用 SQLite 覆盖 API 契约、唯一约束错误映射、服务项目/环境复合外键归属约束、未知 `IntegrityError` 映射、密码非明文保存、登录成功/失败、未知用户 dummy hash 校验、未配置/弱/有效 `AUTH_SECRET_KEY`、HTTP Bearer OpenAPI 描述、当前用户依赖识别 token 用户、项目创建后创建者获得 `admin`、创建者授权失败时项目创建回滚、无权限跨项目环境 ID 不泄露且不能创建服务、未授权用户无法读取他人项目、`viewer` 只读、`editor` 可创建环境/服务、`admin`/superuser 可管理、停用用户被拒绝、API Key 明文只在创建响应出现、`key_hash` 不等于明文、列表/撤销不返回明文或哈希、无项目成员关系的普通用户无法通过 API Key 管理端点区分项目存在性、`viewer`/`editor` 被 API Key 创建/列表/撤销拒绝、撤销后 `verify_key()` 失败、缺失项目/无权限项目行为、events/metrics/logs 摄入 API 使用 `Authorization: Bearer <api_key>` 与 `X-API-Key` 绑定项目、缺失/无效/撤销 API Key 拒绝、启用后摄入 API Key 固定窗口限流返回 `429`、成功摄入后统计聚合、统计查询项目权限过滤、payload/tags/attributes 校验错误返回 `422`、metrics 非有限 value 拒绝、logs message 长度限制、顶层 `project_id` 不能覆盖归属、嵌套业务载荷中的跨项目 `project_id` 不影响 API Key 项目上下文和 Alembic 升降级；ClickHouse 已覆盖 compose 配置展开、init SQL 挂载路径和预期表名静态检查；MongoDB 已覆盖 compose 配置展开、init 脚本挂载路径、events 集合和预期索引静态检查。真实 MySQL 回归测试覆盖项目创建授权事务回滚、跨项目 environment_id 非泄露和临时库清理，后续仍可继续扩展 migration、外键、唯一索引、JSON 字段、用户唯一约束、RBAC 约束、API Key 约束和摄入记录写入的 MySQL 专项用例；真实 ClickHouse/MongoDB/Redis 容器初始化与写入链路仍需后续补验。
- 安全边界：认证接口接收密码并返回 token，但代码未输出请求体日志；API Key 创建接口会返回一次性明文，后续结构化日志必须脱敏 `password`、`access_token`、`Authorization`、Cookie、数据库连接串、API Key 和通知 Webhook 密钥。当前尚未开放团队/成员管理或项目授权 API，后续需补管理员授权入口、审计日志、API Key 使用审计和危险动作 `admin` 校验。
