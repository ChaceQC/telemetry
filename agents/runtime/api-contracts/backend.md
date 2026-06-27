# 后端 API 契约草案

本文件由后端开发 agent 维护，供总 agent 汇总到 `AGENT_COMMUNICATION.md`。当前草案对应 `T-0085`：阶段 1 已将项目、环境和服务管理 API 接入项目级 RBAC 基础，并新增项目范围 API Key 创建、列表、撤销；阶段 2 已提供 events/metrics/logs/traces 摄入 API 基础，并使用 API Key 作为上报鉴权入口；ClickHouse/MongoDB 开发容器初始化基础已补齐，摄入 API Key 限流支持内存和 Redis 固定窗口后端，摄入统计可按项目查询并记录部分拒绝路径；阶段 3 已提供 events/logs/metrics 查询 API、统一 envelope 游标分页基础、logs 最小上下文查询 API、logs 基础关键词搜索、logs 顶层 `trace_id`/`span_id` 结构化字段精确过滤和 logs `attributes.request_id`/`attributes.user_id` 白名单字段精确过滤，并补充 `ingest_records(project_id, kind, received_at, id)` 组合索引以支撑日志上下文窗口和带项目过滤的查询分页；阶段 4 已提供 traces 摄入、关系库 trace span 查询和关系库 trace 服务拓扑最小基础；阶段 5 已提供 dashboard CRUD 后端基础，对 dashboard `config.panels` 增加最小 panel schema 校验，新增 dashboard 全局 `config.time_range` 最小保存校验，新增已保存 dashboard panel 的只读查询预览 API，并对 dashboard `config.variables` 增加最小变量 schema 校验与规范化；panel preview 会在 panel query 未显式设置对应时间边界时继承 dashboard 全局 `config.time_range`，并会在执行前用请求 query 参数 `variables` 中的一次性变量覆盖值或已保存变量 default 替换顶层 query 字段中的完整 `${变量名}` 模板；dashboard 现已提供内置 template 列表/读取和从模板创建普通 dashboard 的最小后端基础，内置 `service-overview` 服务总览模板使用既有 `panels`、`time_range`、`variables` schema；dashboard 现已提供单个已保存 dashboard 的可移植 JSON 导出和导入创建普通 dashboard 的最小后端能力；阶段 6 已提供告警规则 CRUD 后端基础、指标阈值告警的一次性手动评估 API 和告警周期评估当前状态持久化骨架。管理 API 需要有效 Bearer token 和启用用户；超级用户可访问全部资源，普通用户只能访问自己拥有项目角色的资源。

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
- 查询保护配置：
  - `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT`：默认 `10000`；限制 `GET /api/v1/query/traces/topology` 在数据库侧读取的匹配 trace span 数。该配置用于控制拓扑扫描窗口，不等同于接口 `limit`。

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

## API-0023 Dashboard CRUD

- 鉴权：所有 dashboard 接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。
- 权限：
  - 列表/读取要求目标项目至少 `viewer`；全局列表不传 `project_id` 时自动过滤为当前用户可访问项目。
  - 创建/更新/删除要求目标项目至少 `editor`；`viewer` 返回 `403 无项目权限`。
  - 导出要求目标项目至少 `viewer`；导入要求目标项目至少 `editor`，导入后创建普通 dashboard。
  - 普通用户没有目标项目成员关系时返回 `404 项目不存在`，避免枚举项目；dashboard ID 不属于指定项目时返回 `404 仪表盘不存在`。
  - 超级用户可访问全部已存在项目，但项目不存在仍返回 `404 项目不存在`。

### 列出 dashboard

- 方法：`GET`
- 路径：`/api/v1/dashboards`
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目 dashboard。
  - `limit`：可选，默认 `50`，范围 `1..100`。
  - `offset`：可选，默认 `0`，范围 `>=0`。
- 响应：`200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "name": "服务总览",
      "description": "值班视图",
      "layout": {"version": 1, "widgets": []},
      "config": {"refresh_seconds": 30},
      "created_by_user_id": 1,
      "updated_by_user_id": 1,
      "created_at": "2026-06-23T10:20:00Z",
      "updated_at": "2026-06-23T10:20:00Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1
}
```

### 创建 dashboard

- 方法：`POST`
- 路径：`/api/v1/dashboards`
- 请求体：

```json
{
  "project_id": 1,
  "name": "服务总览",
  "description": "值班视图",
  "layout": {"version": 1, "widgets": []},
  "config": {"refresh_seconds": 30}
}
```

- 字段规则：
  - `project_id`：必填，正整数。
  - `name`：必填，1 到 100 字符，首尾空白会裁剪。
  - `description`：可选，最多 500 字符。
  - `layout`：可选，必须是 JSON 对象或数组，默认 `{}`；序列化后不超过 64 KiB，嵌套深度不超过 32，复杂度不超过 4096 个节点，且不能包含 `NaN`、`Infinity` 或 `-Infinity`。
  - `config`：可选，必须是 JSON 对象或数组，默认 `{}`；序列化后不超过 64 KiB，嵌套深度不超过 32，复杂度不超过 4096 个节点，且不能包含 `NaN`、`Infinity` 或 `-Infinity`。当 `config` 是对象且包含顶层 `time_range` 时，`time_range` 必须是对象；相对范围为 `{"mode":"relative","relative":"15m|1h|6h|24h|7d"}`，绝对范围为 `{"mode":"absolute","from":"ISO 8601","to":"ISO 8601"}`；`mode/relative/from/to` 会裁剪首尾空白并按裁剪后字符串保存，绝对范围要求 `from/to` 可解析并可比较为 ISO 8601 时间且 `from < to`。当 `config` 是对象且包含顶层 `panels` 时，`panels` 必须是数组；每个 panel 必须是对象，包含 `id`（1 到 64 字符）、`title`（1 到 120 字符）、`type`（`metrics`、`logs`、`events`、`traces`、`topology` 之一）和对象类型的 `query`；`id/title/type` 会先裁剪首尾空白再校验和保存，同一数组内重复 `id` 也按裁剪后值判断；可选 `layout` 必须是对象，包含非负 `x/y` 和正数 `w/h`。当 `config` 是对象且包含顶层 `variables` 时，`variables` 必须是数组；每个变量必须是对象，包含 `name`（1 到 64 字符，仅字母、数字、下划线，且不能以数字开头）和 `type`（`text`、`number`、`select` 之一），可选 `label` 最多 120 字符；`name/label/type/default/options` 字符串值会裁剪首尾空白后保存，同一数组内重复 `name` 也按裁剪后值判断。`text` 变量可选字符串 `default` 且不接受 `options`；`number` 变量可选有限数字 `default` 且不接受 `options`；`select` 变量必须提供非空字符串数组 `options`，选项裁剪后不能为空且不能重复，可选 `default` 必须匹配某个 option。旧版 `{}`、`{"refresh_seconds": 30}`、没有 `time_range`、未使用顶层 `panels` 或未使用顶层 `variables` 的 config 结构保持兼容。
- 响应：`201 Created`，返回 dashboard 对象。

### 列出 / 读取 dashboard template

- 方法：`GET`
- 路径：
  - `/api/v1/dashboard-templates`
  - `/api/v1/dashboard-templates/{template_id}`
- 权限：需要有效 Bearer token 和启用用户；内置模板读取不依赖项目角色。
- 响应：列表返回 `{"items":[...]}`；读取返回单个模板对象。模板对象包含 `id`、`name`、`description`、`layout`、`config`。
- 当前内置模板：
  - `service-overview` / `服务总览`：内置服务健康总览，`config.time_range` 默认为 `relative: 1h`，包含 `service_source`、`log_level`、`row_limit` 变量，以及 metrics/logs/traces/topology 四个最小 panel。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `404 Not Found`：`template_id` 不存在时返回 `仪表盘模板不存在`。
  - `422 Unprocessable Entity`：路径参数格式错误。

### 从 template 创建 dashboard

- 方法：`POST`
- 路径：`/api/v1/projects/{project_id}/dashboard-templates/{template_id}/dashboards`
- 路径参数：
  - `project_id`：正整数，作为权限边界和创建后 dashboard 归属边界。
  - `template_id`：1 到 64 字符，当前支持 `service-overview`。
- 权限：复用现有 dashboard 创建语义，目标项目至少 `editor`；`viewer` 返回 `403 无项目权限`；普通用户无项目成员关系或项目不存在返回 `404 项目不存在`；超级用户仍要求项目存在。
- 请求体：可为空对象；仅允许可选 `name` 和 `description` 覆盖模板默认值。

```json
{
  "name": "支付服务总览",
  "description": "支付团队值班入口"
}
```

- 行为：服务端使用路径 `project_id` 和内置模板 `layout/config` 构造 `DashboardCreate`，复用现有 JSON 大小/深度/复杂度/非有限数、`panels`、`time_range`、`variables` schema 校验；创建出的记录是普通 dashboard，后续复用现有读取、更新、删除、preview 和 RBAC。
- 防注入边界：请求体未声明字段使用 `extra=forbid`，`project_id`、`layout`、`config` 等字段返回 `422`，不能覆盖路径项目或注入模板外 config。
- 可变引用边界：内置模板读取时会深拷贝 `layout/config` 并通过保存层 schema 校验；多次读取或多次创建不会共享可变 config 引用。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证且处于目标项目权限范围内，但缺少 `editor`。
  - `404 Not Found`：项目不存在、普通用户不在项目权限范围内，或权限通过后 `template_id` 不存在。
  - `409 Conflict`：dashboard 数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段或路径参数格式错误，包括请求体试图传入未声明字段。

### 读取 / 更新 / 删除 dashboard

- 路径：`/api/v1/projects/{project_id}/dashboards/{dashboard_id}`
- 路径参数：
  - `project_id`：正整数，作为权限边界和 dashboard 归属边界。
  - `dashboard_id`：正整数。
- `GET`：读取 dashboard，响应 `200 OK`，返回 dashboard 对象。
- `PATCH`：部分更新 dashboard，响应 `200 OK`，返回更新后对象。
- `DELETE`：删除 dashboard，成功响应 `204 No Content`。

PATCH 请求体示例：

```json
{
  "name": "服务健康概览",
  "description": null,
  "layout": [{"x": 0, "y": 0, "w": 6, "h": 4}],
  "config": {"refresh_seconds": 60}
}
```

- 更新规则：至少提供一个字段；未传 `layout/config` 时保持原值；传入空对象或空数组有效；`description=null` 表示清空描述；`name=null`、`layout=null`、`config=null` 返回 `422`；`layout/config` 的大小、深度、复杂度和非有限数限制与创建一致；`config.time_range`、`config.panels` 和 `config.variables` 的最小 schema 校验与创建一致。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证且处于目标项目权限范围内，但缺少本动作要求的角色。
  - `404 Not Found`：项目不存在、普通用户不在项目权限范围内、dashboard 不属于指定项目/不存在，或 template 不存在。
  - `409 Conflict`：dashboard 数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段、路径参数或分页参数格式错误，包括 `layout/config` 超过大小、深度、复杂度限制、包含非有限数，`config.time_range` 非对象、未知 `mode`、缺少必填字段、非字符串或空字符串、未知相对范围、绝对范围时间不可解析或 `from >= to`，`config.panels` 非数组、panel 非对象、缺少必填字段、未知 `type`、重复 `id`、`query` 非对象、`layout` 数值非法，或 `config.variables` 非数组、variable 非对象、缺少必填字段、非法 `name/type/options/default`、重复 `name`。
- 当前边界：不做前端 dashboard 页面，不做 panel 图表渲染，不接 ClickHouse 查询，不做保存时用户会话级变量状态、模板市场、分享/只读模式、自动刷新或告警规则。

### Dashboard JSON 导出 / 导入

- `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/export`：权限与 dashboard 读取一致，目标项目至少 `viewer`；普通用户无项目成员关系或项目不存在返回 `404 项目不存在`，dashboard 不属于指定项目或不存在返回 `404 仪表盘不存在`。
- 导出响应为 `DashboardExportDocument`，公开字段只包含 `schema/version/name/description/layout/config`；`schema` 固定为 `telemetry.dashboard`，`version` 固定为严格整数 `1`；不包含 `id/project_id/created_by_user_id/updated_by_user_id/created_at/updated_at` 等实例字段。
- `POST /api/v1/projects/{project_id}/dashboards/import`：权限与 dashboard 创建一致，目标项目至少 `editor`；普通用户无项目成员关系或项目不存在返回 `404 项目不存在`，`viewer` 返回 `403 无项目权限`。
- 导入请求体包含必需的 `document` 和可选顶层 `name/description` 覆盖；`document` 复用导出文档 schema/version 校验、实例字段禁止、layout/config 大小/深度/复杂度/finite-number、panel/time_range/variables 校验，非法 schema/version、缺字段、实例字段注入或超限 JSON 均返回 `422`。
- 当前边界：不做文件上传存储、批量导入、覆盖已有 dashboard、模板市场、分享/只读、跨项目权限提升、ClickHouse 数据导出或告警。

## API-0024 Dashboard panel 查询预览

- 鉴权：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。
- 权限：读取已保存 panel preview 要求目标项目至少 `viewer`；`viewer/editor/admin/superuser` 均可读取。普通用户没有目标项目成员关系、项目不存在、dashboard 不属于指定项目或 panel 不存在时返回隐藏式 `404`。
- 方法：`GET`
- 路径：`/api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview`
- 路径参数：
  - `project_id`：正整数，作为权限边界和 dashboard 归属边界。
  - `dashboard_id`：正整数。
  - `panel_id`：1 到 64 字符，匹配已保存 `config.panels[].id`；只读取已保存 config，不接受请求体中的草稿 config。
- 查询参数：
  - `variables`：可选，JSON 对象字符串，例如 `{"service_source":"api","row_limit":20}`；用于本次 preview 的一次性变量覆盖值。服务端先读取已保存 dashboard 和 panel，再解析该参数；非法 JSON、非对象、未知变量或覆盖值类型不符合已保存 `config.variables` 定义时返回 `422`。该参数不写回 dashboard config，不改变响应体 `query`。
- 响应：`200 OK`

```json
{
  "project_id": 1,
  "dashboard_id": 1,
  "panel_id": "latency",
  "title": "Latency",
  "panel_type": "metrics",
  "query": {"name": "http.duration", "window": "5m", "aggregation": "avg"},
  "preview": {
    "kind": "metrics",
    "mode": "aggregate",
    "items": [
      {
        "project_id": 1,
        "name": "http.duration",
        "source": "api",
        "window_start": "2026-06-20T10:00:00Z",
        "window_end": "2026-06-20T10:05:00Z",
        "aggregation": "avg",
        "value": 15.0,
        "sample_count": 2,
        "unit": "ms"
      }
    ]
  }
}
```

- `preview` 按 panel type 返回：
  - `metrics`：复用当前关系库指标窗口聚合，返回 `{"kind":"metrics","mode":"aggregate","items":[MetricAggregateResponse...]}`。
  - `logs`：复用当前关系库日志查询，返回 `{"kind":"logs","mode":"recent","items":[LogQueryResponse...]}`。
  - `events`：复用当前关系库事件查询，返回 `{"kind":"events","mode":"recent","items":[EventQueryResponse...]}`。
  - `traces`：复用当前关系库 trace span 查询，返回 `{"kind":"traces","mode":"recent","items":[TraceQueryResponse...]}`。
  - `topology`：复用当前关系库 trace 服务拓扑，返回 `{"kind":"topology","mode":"topology","nodes":[...],"edges":[...]}`。
- `query` 白名单字段：
  - 通用：`source`、`occurred_from`、`occurred_to`、`limit`。
  - `metrics`：`name`、`window`（`1m/5m/15m/1h`）、`aggregation`（`avg/sum/min/max/count`）。
  - `logs`：`level`、`keyword`、`trace_id`、`span_id`、`request_id`、`user_id`。
  - `events`：`type` 或 `event_type`。
  - `traces`：`trace_id`、`span_id`、`name`、`status_code`、`duration_min_ms`、`duration_max_ms`。
  - `topology`：使用通用 `source`、时间范围和 `limit`。
- 变量替换与请求覆盖：preview 执行前读取已保存 dashboard `config.variables`，仅当已保存 panel `query` 顶层字段值完整匹配 `${变量名}` 时替换变量值，再进入现有 query 白名单校验和 preview 执行。若请求 query 参数 `variables` JSON 对象中提供了该变量名，覆盖值优先于已保存 `default`；否则使用已保存 `default`。`text/select` 覆盖值和 default 均必须是字符串，`select` 还必须匹配 `options`；`number` 覆盖值和 default 均必须是有限数字且不能是 bool。响应体 `query` 仍返回已保存的原始 query，不回写替换结果。未知变量、变量无 `default` 且无覆盖、模板语法非法、覆盖值类型不符合变量定义或替换后类型不满足现有 query 校验时返回 `422`。不支持部分字符串拼接替换、数组/对象深层模板替换、表达式、用户会话级变量状态或保存覆盖值，也不修改 dashboard 保存契约。
- 时间范围继承：当 dashboard 保存了对象类型 `config.time_range` 时，preview 会在变量覆盖/default 替换后，在 panel query 未显式设置对应时间边界时转换为 query service 使用的 `occurred_from` / `occurred_to`。相对范围 `{"mode":"relative","relative":"15m|1h|6h|24h|7d"}` 基于服务端当前 UTC 时间生成 `[now-relative, now]`；绝对范围 `{"mode":"absolute","from":"ISO 8601","to":"ISO 8601"}` 使用保存的 `from/to`。panel query 显式 `occurred_from` / `occurred_to` 分别优先于 dashboard 全局范围，因此这些字段通过变量覆盖解析出的值也优先于 dashboard 全局范围；没有 `time_range`、非对象 config、legacy config 或历史非法 `time_range` 形状按旧行为不继承时间过滤。
- 字段规则：未知 query 字段忽略；`limit` 默认为 `20`，范围 `1..100`；时间字段必须是 ISO 8601 字符串；`metrics` 的 `window/aggregation` 必须是字符串枚举值；字符串字段类型错误、过长、非法 `window/aggregation`、非有限 duration 或 duration 下界大于上界返回 `422`。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `404 Not Found`：项目不存在、普通用户不在项目权限范围内、dashboard 不属于该项目/不存在、`config` 非对象或未保存 `panels`、`panel_id` 不存在。
  - `422 Unprocessable Entity`：路径参数、`variables` 非合法 JSON 对象、未知覆盖变量、变量模板、变量 default/override 或已保存 panel query 中参与预览的白名单字段非法。
- 当前边界：只读已保存 dashboard `config.panels` 和 `config.variables`；仅支持 GET `variables` query 参数形式的一次性覆盖，不支持未保存草稿 config，不写 dashboard，不接 ClickHouse，不做真实图表渲染、模板 dashboard、缓存、后台任务或告警。

## API-0025 告警规则 CRUD

- 鉴权：所有告警规则接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。
- 权限：
  - 列表/读取要求目标项目至少 `viewer`；全局列表不传 `project_id` 时自动过滤为当前用户可访问项目。
  - 创建/更新/删除要求目标项目至少 `editor`；`viewer` 返回 `403 无项目权限`。
  - 普通用户没有目标项目成员关系时返回 `404 项目不存在`，避免枚举项目；rule ID 不属于指定项目时返回 `404 告警规则不存在`。
  - 超级用户可访问全部已存在项目，但项目不存在仍返回 `404 项目不存在`。

### 列出告警规则

- 方法：`GET`
- 路径：`/api/v1/alerts/rules`
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目告警规则。
  - `severity`：可选，`info`、`warning`、`critical`。
  - `signal`：可选，`metrics`、`logs`、`traces`、`events`。
  - `enabled`：可选，布尔值。
  - `limit`：可选，默认 `50`，范围 `1..100`。
  - `offset`：可选，默认 `0`，范围 `>=0`。
- 响应：`200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "name": "HTTP 5xx rate",
      "description": "5 分钟错误率过高",
      "enabled": true,
      "severity": "critical",
      "signal": "metrics",
      "condition": {"metric": "http.server.errors", "operator": "gt", "threshold": 3},
      "evaluation": {"window_seconds": 300, "interval_seconds": 60},
      "created_by_user_id": 1,
      "updated_by_user_id": 1,
      "created_at": "2026-06-26T12:00:00Z",
      "updated_at": "2026-06-26T12:00:00Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1
}
```

### 创建告警规则

- 方法：`POST`
- 路径：`/api/v1/alerts/rules`
- 请求体：

```json
{
  "project_id": 1,
  "name": "HTTP 5xx rate",
  "description": "5 分钟错误率过高",
  "enabled": true,
  "severity": "critical",
  "signal": "metrics",
  "condition": {"metric": "http.server.errors", "operator": "gt", "threshold": 3},
  "evaluation": {"window_seconds": 300, "interval_seconds": 60}
}
```

- 字段规则：
  - `project_id`：必填，正整数。
  - `name`：必填，1 到 100 字符，首尾空白会裁剪；同一项目内唯一。
  - `description`：可选，最多 500 字符。
  - `enabled`：可选，默认 `true`。
  - `severity`：必填，`info`、`warning`、`critical`。
  - `signal`：必填，`metrics`、`logs`、`traces`、`events`。
  - `condition`：必填，非空 JSON 对象；序列化后不超过 16 KiB，嵌套深度不超过 16，复杂度不超过 1024 个节点，且不能包含 `NaN`、`Infinity` 或 `-Infinity`。
  - `evaluation`：必填，非空 JSON 对象；大小、深度、复杂度和 finite-number 限制同 `condition`；当前还要求 `window_seconds` 和 `interval_seconds` 为 `1..86400` 的整数。
- 响应：`201 Created`，返回告警规则对象。

### 读取 / 更新 / 删除告警规则

- 路径：`/api/v1/projects/{project_id}/alerts/rules/{rule_id}`
- 路径参数：
  - `project_id`：正整数，作为权限边界和规则归属边界。
  - `rule_id`：正整数。
- `GET`：读取告警规则，响应 `200 OK`，返回告警规则对象。
- `PATCH`：部分更新告警规则，响应 `200 OK`，返回更新后对象。
- `DELETE`：删除告警规则，成功响应 `204 No Content`。

PATCH 请求体示例：

```json
{
  "name": "HTTP 5xx burn rate",
  "description": null,
  "enabled": false,
  "severity": "warning",
  "signal": "logs",
  "condition": {"field": "level", "operator": "eq", "value": "error"},
  "evaluation": {"window_seconds": 600, "interval_seconds": 120}
}
```

- 更新规则：至少提供一个字段；未传 `condition/evaluation` 时保持原值；`description=null` 表示清空描述；`name/enabled/severity/signal/condition/evaluation=null` 返回 `422`；`condition/evaluation` 的 JSON 限制与创建一致。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证且处于目标项目权限范围内，但缺少本动作要求的角色。
  - `404 Not Found`：项目不存在、普通用户不在项目权限范围内，或告警规则不属于指定项目/不存在。
  - `409 Conflict`：同一项目下 `name` 重复，或告警规则数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段、路径参数、分页参数、枚举、JSON 形状、JSON 大小/深度/复杂度/非有限数、空 PATCH 或 evaluation 窗口字段非法。
- 当前边界：本小步只保存/读取规则定义；不实现规则评估、后台调度、通知渠道、告警历史、静默/恢复、Webhook、前端 UI、ClickHouse/MongoDB/Redis 后台链路或 events 自动写入。

## API-0026 指标阈值告警手动评估

- 方法：`POST`
- 路径：`/api/v1/projects/{project_id}/alerts/rules/{rule_id}/evaluate`
- 鉴权：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。
- 权限：
  - 目标项目至少 `viewer` 可手动评估规则。
  - 普通用户没有目标项目成员关系时返回 `404 项目不存在`；rule ID 不属于指定项目时返回 `404 告警规则不存在`。
  - 超级用户可评估任意已存在项目的规则。
- 请求体：无。服务端读取已保存的 API-0025 告警规则、`condition` 与 `evaluation`。
- 支持范围：
  - 本小步仅支持 `signal="metrics"` 的指标阈值规则。
  - `condition.metric`：必填字符串，1 到 128 字符，对应指标 `name`；关系库当前以 `ingest_records.event_type` 保存和过滤 metric name，payload 中的 `name` 只是冗余载荷。
  - `condition.source`：可选字符串，1 到 128 字符，对应指标 `source` 精确过滤。
  - `condition.operator`：必填，`gt`、`gte`、`lt`、`lte`、`eq`、`ne`。
  - `condition.threshold`：必填 JSON number，必须为有限数，不能是 bool 或字符串数字。
  - `condition.aggregation`：可选，默认 `avg`；支持 `avg`、`sum`、`min`、`max`、`count`。
  - `evaluation.window_seconds`：使用 API-0025 已校验的 `1..86400` 整数作为向前查询窗口。
  - `evaluation.interval_seconds`：本小步原样返回，用于后续调度；手动评估不根据它调度。
- 查询规则：
  - `checked_at` 取服务端当前 UTC 时间。
  - 查询窗口为 `[checked_at - evaluation.window_seconds, checked_at]`。
  - 当前查询来源为关系库 `ingest_records.kind=metric`；评估使用内部单窗口聚合辅助，按 `project_id`、`event_type=condition.metric`、可选 `source` 和 `occurred_at` 闭区间过滤，不改变既有指标分桶聚合 API 行为。
  - 若窗口内没有可聚合样本，返回 `status="no_data"`。
  - 若规则 `enabled=false`，返回 `status="disabled"`，不得查询指标样本。
- 响应：`200 OK`。

```json
{
  "project_id": 1,
  "rule_id": 7,
  "status": "firing",
  "signal": "metrics",
  "severity": "critical",
  "checked_at": "2026-06-27T00:00:00Z",
  "window": {
    "from": "2026-06-26T23:55:00Z",
    "to": "2026-06-27T00:00:00Z",
    "window_seconds": 300,
    "interval_seconds": 60
  },
  "condition": {
    "metric": "http.server.errors",
    "source": "api",
    "operator": "gt",
    "threshold": 3,
    "aggregation": "sum"
  },
  "observed": {
    "value": 4,
    "sample_count": 10,
    "aggregation": "sum",
    "unit": null
  },
  "message": "metric http.server.errors sum 4 > 3"
}
```

- `status` 枚举：
  - `firing`：有样本且聚合值满足阈值比较。
  - `ok`：有样本但聚合值不满足阈值比较。
  - `no_data`：目标窗口无可聚合指标样本。
  - `disabled`：规则已禁用，未查询指标样本。
- `observed`：`disabled` 与 `no_data` 时为 `null`；其他状态下包含聚合值、样本数、aggregation 和 unit。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `404 Not Found`：项目不存在、普通用户不在项目权限范围内，或告警规则不属于指定项目/不存在。
  - `422 Unprocessable Entity`：规则不是 `signal="metrics"`，或 `condition.metric/operator/threshold/aggregation/source` 不符合本小步执行语义，或已保存 `evaluation.window_seconds/interval_seconds` 不满足执行要求。
- 当前边界：只提供手动、同步、一次性的指标阈值评估；不实现后台 scheduler、周期执行、状态持久化、通知渠道、告警历史、恢复事件、静默、抑制、分组、Webhook、前端 UI、ClickHouse/MongoDB/Redis 链路或 events 自动写入。周期执行入口见 API-0027。

## API-0027 告警周期评估状态骨架

- 方法：`POST`
- 路径：`/api/v1/alerts/evaluations/run-due`
- 鉴权：需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。
- 权限：仅超级用户可触发；非超级用户返回 `403 Forbidden`，`detail="需要超级用户权限"`。
- 请求体：无。
- 查询参数：当前不实现 `limit` 或 `project_id`，因此传入未声明 query 参数不会改变扫描范围；如后续引入必须补充明确校验和权限语义。
- 扫描规则：
  - 读取所有 `enabled=true` 告警规则；禁用规则不扫描、不创建状态。
  - 状态表 `alert_evaluation_states` 每条规则最多一条当前状态，按 `rule_id` 唯一。
  - 缺少状态、状态缺少 `next_evaluate_at`，或 `next_evaluate_at <= checked_at` 时视为 due；未到期规则只返回 skipped item，不更新状态。
  - due 规则当前只执行 `signal="metrics"` 且满足 API-0026 condition/evaluation 语义的指标阈值评估，复用 API-0026 的单窗口关系库 metrics 聚合。
  - due 且成功评估后持久化 `status=firing/ok/no_data`、`last_evaluated_at=checked_at`、`next_evaluate_at=checked_at+evaluation.interval_seconds`、`last_result` 和 `last_error=null`。
  - due 但非 metrics 或已保存 condition/evaluation 不满足 API-0026 执行语义时，持久化 `status=error`、`last_evaluated_at`、`next_evaluate_at`、`last_result=null` 和 `last_error` 错误摘要。
- 响应：`200 OK`。

```json
{
  "checked_at": "2026-06-27T00:00:00Z",
  "evaluated_count": 2,
  "skipped_count": 1,
  "created_state_count": 1,
  "updated_state_count": 1,
  "items": [
    {
      "project_id": 1,
      "rule_id": 7,
      "old_status": null,
      "new_status": "firing",
      "due": true,
      "next_evaluate_at": "2026-06-27T00:01:00Z",
      "error_summary": null
    },
    {
      "project_id": 1,
      "rule_id": 8,
      "old_status": "firing",
      "new_status": "firing",
      "due": false,
      "next_evaluate_at": "2026-06-27T00:02:00Z",
      "error_summary": null
    }
  ]
}
```

- 响应字段：
  - `evaluated_count`：本轮 due 并实际写入当前状态的规则数，包括成功评估和 `error`。
  - `skipped_count`：enabled 但未到期的规则数。
  - `created_state_count` / `updated_state_count`：本轮创建或更新 `alert_evaluation_states` 的数量。
  - `items[].old_status`：扫描前状态，缺少状态时为 `null`。
  - `items[].new_status`：本轮后的状态；未到期时等于旧状态。
  - `items[].due`：本项本轮是否 due。
  - `items[].error_summary`：成功或未到期时为 `null`；执行语义错误时为摘要。
- 持久化表：`alert_evaluation_states` 保存 `rule_id`、`project_id`、`status`、`last_evaluated_at`、`next_evaluate_at`、`last_result`、`last_error`、`created_at`、`updated_at`；`last_result` 为最近一次成功评估的 JSON 摘要，不保存完整历史。
- 错误：
  - `401 Unauthorized`：缺少 token、token 无效、token 过期、token 对应用户不存在或用户已停用。
  - `403 Forbidden`：已认证但不是超级用户。
- 当前边界：不做后台常驻 scheduler、不做通知渠道、告警历史表、恢复事件、静默/抑制、Webhook、前端 UI、ClickHouse/MongoDB/Redis 链路或 events 自动写入。

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
- 方法：`POST`
- 路径：`/api/v1/ingest/traces`
- 权限：同 `/api/v1/ingest/events`。
- 请求体：

```json
{
  "spans": [
    {
      "trace_id": "trace-1",
      "span_id": "span-1",
      "parent_span_id": "root-span",
      "name": "GET /health",
      "start_time": "2026-06-21T00:00:00Z",
      "end_time": "2026-06-21T00:00:00.125Z",
      "duration_ms": 125,
      "status_code": "ok",
      "source": "api",
      "attributes": {
        "service.name": "backend"
      },
      "payload": {
        "http.method": "GET"
      }
    }
  ]
}
```

- 字段规则：
  - `spans`：必填数组，至少 1 条、最多 100 条，整体 JSON 序列化后不超过 256 KiB。
  - `trace_id`、`span_id`：必填，1 到 128 字符。
  - `parent_span_id`：可选，最长 128 字符。
  - `name`：必填，1 到 128 字符；receipt 中 `type` 为 span `name`。
  - `start_time`：必填，ISO 8601 时间；入库为 `occurred_at`。
  - `end_time`：可选，ISO 8601 时间；不能早于 `start_time`，且与 `start_time` 时区格式一致。
  - `duration_ms`：可选，有限非负数值；未传且有 `end_time` 时后端按起止时间计算。
  - `status_code`：可选，最长 64 字符。
  - `source`：可选，最长 128 字符。
  - `attributes`、`payload`：可选对象，任意层级不得包含非有限数值。
  - 顶层额外字段会返回 `422`；客户端不能通过顶层 `project_id` 指定或覆盖项目归属。
- 响应：`202 Accepted`，格式同 batch receipt；receipt 中 `kind` 为 `trace`，`type` 为 span `name`。
- 错误：
  - `401 Unauthorized`：缺少 API Key、API Key 无效或已撤销。
  - `429 Too Many Requests`：启用摄入限流且当前 API Key 超过固定窗口阈值，响应包含 `Retry-After`。
  - `503 Service Unavailable`：启用 Redis 限流后端且 Redis 连接或命令不可用。
  - `422 Unprocessable Entity`：请求体字段格式错误、出现额外字段、缺失必填字段、payload/tags/attributes 超限或含非有限数值、metrics value 非有限数值、logs message 超长、trace duration/time 无效或批量条数/大小超限。
- 持久化：当前写入 MySQL/SQLite `ingest_records` 表，字段包含 `project_id`、`api_key_id`、`kind`、`event_type`、`source`、`payload` JSON、`occurred_at`、`received_at`。events 写入 `kind=event` 且 `event_type=type`；metrics 写入 `kind=metric` 且 `event_type=name`；logs 写入 `kind=log` 且 `event_type=level`；traces 写入 `kind=trace` 且 `event_type=name`。trace payload 保存 `trace_id`、`span_id`、`parent_span_id`、`name`、`start_time`、`end_time`、`duration_ms`、`status_code`、`source`、`attributes`、业务 `payload` 和原始 span `raw`。`ingest_records.kind` 是字符串列，新增 `trace` kind 不需要新迁移；MySQL/MariaDB 下 `ingest_records.occurred_at` 与 `received_at` 使用 `DATETIME(6)` 保留微秒精度；`ingest_records` 已补充 `(project_id, kind, received_at, id)` 组合索引，覆盖日志上下文 `project_id + kind + received_at/id` 窗口查询，并可被带项目过滤的 events/logs/metrics/traces 分页查询复用。
- 安全边界：
  - 项目归属只来自 API Key 校验结果，不接受客户端顶层 `project_id`。
  - 若 `project_id` 出现在 `payload`、`tags` 或 `attributes` 内，仅作为业务载荷保存，不影响归属。
  - 应用当前不输出请求体日志；后续结构化日志必须脱敏 `Authorization`、`X-API-Key` 和 payload 中可能存在的敏感字段。
  - 当前尚未实现审计日志或 ClickHouse/MongoDB 写入。

## API-0013 摄入统计查询

- `GET /api/v1/ingest/stats`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目，无权项目返回 `404`。
  - `kind`：可选，`event`、`metric`、`log` 或 `trace`。
  - `limit`：可选，默认 `100`，范围 `1..500`。
- 响应：数组，每项包含 `bucket_start`、`project_id`、`api_key_id`、`kind`、`source`、`accepted_count`、`rejected_count`、`bytes_count`。
- 当前统计来源：关系库 `ingest_stats` 按分钟桶、项目、API Key、kind 和 source 聚合；成功摄入路径累加 `accepted_count` 和 `bytes_count`，已验证 API Key 后的请求体验证失败与限流拒绝会累加 `rejected_count`。缺失/无效/撤销 API Key 等缺少可信项目/API Key 维度的请求暂不统计，ClickHouse `ingest_stats` 写入和更完整后台聚合查询后续补齐。

## API-0014 事件查询

- `GET /api/v1/query/events`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `type`：可选，事件类型，长度 `1..128`。
  - `source`：可选，来源，长度 `1..128`。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按事件 `occurred_at` 过滤。
  - `limit`：可选，默认 `100`，范围 `1..500`。
  - `cursor`：可选，字符串；使用上一页响应的 `next_cursor` 继续向后翻页。
- 响应：统一 envelope，`items` 为事件数组，`next_cursor` 为下一页游标；无更多数据时 `next_cursor=null`。

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "type": "deployment",
      "source": "ci",
      "payload": {"status": "ok"},
      "occurred_at": "2026-06-21T00:00:00Z",
      "received_at": "2026-06-21T00:00:01Z"
    }
  ],
  "next_cursor": null
}
```

- 分页规则：按 `received_at`、`id` 倒序返回；游标编码包含查询类型、当前筛选条件、`received_at` 和 `id`，避免同一接收时间记录翻页重复或漏项。事件游标只能用于事件查询，并且必须匹配当前筛选条件；非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`，不暴露内部解码细节。前端修改筛选条件时应丢弃旧游标并重新查询第一页。
- 当前查询来源：关系库 `ingest_records` 的 `kind=event` 记录；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；ClickHouse/MongoDB 查询、全文搜索和复杂聚合后续补齐。

## API-0015 日志查询

- `GET /api/v1/query/logs`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `level`：可选，日志级别，长度 `1..32`。
  - `source`：可选，来源，长度 `1..128`。
  - `keyword`：可选，关键词，长度 `1..128`；后端会去除前后空白，空白字符串按未传处理。当前匹配日志 `message` 和关系库日志业务 `payload` 的值文本；不匹配业务 `payload` key 名、wrapper key 名、`logger`/`trace_id`/`span_id` 等元字段或空值脚手架。SQLite 兼容层覆盖业务 `payload` 嵌套对象/数组中的字符串、数字和布尔值；MySQL 兼容层通过 `JSON_SEARCH` 覆盖业务 `payload` 字符串值。
  - `trace_id`：可选，长度 `1..128`；按日志顶层结构化字段 `payload.trace_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理。
  - `span_id`：可选，长度 `1..128`；按日志顶层结构化字段 `payload.span_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理。
  - `request_id`：可选，长度 `1..128`；按日志结构化 `attributes` 白名单字段 `payload.attributes.request_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理；仅 JSON string/text 值参与匹配，numeric/boolean/object/array 同名值不命中，不匹配业务 `payload.request_id`。
  - `user_id`：可选，长度 `1..128`；按日志结构化 `attributes` 白名单字段 `payload.attributes.user_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理；仅 JSON string/text 值参与匹配，numeric/boolean/object/array 同名值不命中，不匹配业务 `payload.user_id`。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按日志 `occurred_at` 过滤。
  - `limit`：可选，默认 `100`，范围 `1..500`。
  - `cursor`：可选，字符串；使用上一页响应的 `next_cursor` 继续向后翻页。
- 响应：统一 envelope，`items` 为日志数组，`next_cursor` 为下一页游标；无更多数据时 `next_cursor=null`。

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "level": "info",
      "message": "deployment finished",
      "source": "worker",
      "logger": "deploy.worker",
      "trace_id": "trace-1",
      "span_id": "span-1",
      "attributes": {"service": "api", "request_id": "req-1", "user_id": "user-1"},
      "payload": {"duration_ms": 42},
      "occurred_at": "2026-06-21T00:00:00Z",
      "received_at": "2026-06-21T00:00:01Z"
    }
  ],
  "next_cursor": null
}
```

- 分页规则：按 `received_at`、`id` 倒序返回；游标编码包含查询类型、当前筛选条件（含规范化后的 `keyword`、`trace_id`、`span_id`、`request_id`、`user_id`）、`received_at` 和 `id`，避免同一接收时间记录翻页重复或漏项。日志游标只能用于日志查询，并且必须匹配当前筛选条件；非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`，不暴露内部解码细节。前端修改筛选条件时应丢弃旧游标并重新查询第一页。
- 当前查询来源：关系库 `ingest_records` 的 `kind=log` 记录；基础关键词搜索只使用日志 `message` 与业务 `payload` 值文本包含匹配，不匹配业务 `payload` key-only；`trace_id`/`span_id` 只做顶层结构化字段精确匹配，`request_id`/`user_id` 只做结构化 `attributes` 白名单字段 JSON string/text 值精确匹配，均不作为 keyword 文本匹配，不搜索业务 `payload` 同名字段，不引入任意 JSON 字段过滤、ClickHouse、全文索引或外部服务；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；ClickHouse 日志查询、字段过滤 DSL 和脱敏后续补齐。

## API-0016 指标查询

- `GET /api/v1/query/metrics`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `name`：可选，指标名，长度 `1..128`。
  - `source`：可选，来源，长度 `1..128`。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按指标 `occurred_at` 过滤。
  - `limit`：可选，默认 `100`，范围 `1..500`。
  - `cursor`：可选，字符串；使用上一页响应的 `next_cursor` 继续向后翻页。
- 响应：统一 envelope，`items` 为指标样本数组，`next_cursor` 为下一页游标；无更多数据时 `next_cursor=null`。

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "name": "http.requests",
      "value": 12,
      "unit": "count",
      "type": "counter",
      "source": "api",
      "tags": {"route": "/api/v1/query"},
      "payload": {"status": 200},
      "occurred_at": "2026-06-21T00:00:00Z",
      "received_at": "2026-06-21T00:00:01Z"
    }
  ],
  "next_cursor": null
}
```

- 分页规则：按 `received_at`、`id` 倒序返回；游标编码包含查询类型、当前筛选条件、`received_at` 和 `id`，避免同一接收时间记录翻页重复或漏项。指标游标只能用于指标查询，并且必须匹配当前筛选条件；非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`，不暴露内部解码细节。前端修改筛选条件时应丢弃旧游标并重新查询第一页。
- 当前查询来源：关系库 `ingest_records` 的 `kind=metric` 记录；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；ClickHouse 指标查询、group by、Top N、降采样和多序列对比后续补齐。基础窗口聚合见 API-0019。

## API-0021 Trace 查询

- `GET /api/v1/query/traces`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `trace_id`：可选，长度 `1..128`；按 trace payload 顶层 `trace_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理。
  - `span_id`：可选，长度 `1..128`；按 trace payload 顶层 `span_id` 精确匹配，后端会去除前后空白，空白字符串按未传处理。
  - `name`：可选，span 名称，长度 `1..128`；当前映射到 `ingest_records.event_type`。
  - `source`：可选，来源，长度 `1..128`。
  - `status_code`：可选，长度 `1..64`；按 trace payload 顶层 `status_code` 精确匹配，后端会去除前后空白，空白字符串按未传处理。
  - `duration_min_ms`：可选，非负有限数值；按 trace payload 顶层 `duration_ms` 做下界过滤。
  - `duration_max_ms`：可选，非负有限数值；按 trace payload 顶层 `duration_ms` 做上界过滤；与 `duration_min_ms` 同时传入时下界不能大于上界，否则返回 `422 duration_min_ms 不能大于 duration_max_ms`。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按 span `occurred_at` 过滤；trace 摄入时该字段来自 span `start_time`；MySQL/MariaDB 下用 `DATETIME(6)` 保留微秒，`2026-06-22T01:00:00.075Z` 不应命中 `2026-06-22T01:00:00.100000Z`。
  - `limit`：可选，默认 `100`，范围 `1..500`。
  - `cursor`：可选，字符串；使用上一页响应的 `next_cursor` 继续向后翻页。
- 响应：统一 envelope，`items` 为 trace span 数组，`next_cursor` 为下一页游标；无更多数据时 `next_cursor=null`。

```json
{
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "trace_id": "trace-1",
      "span_id": "span-1",
      "parent_span_id": null,
      "name": "GET /health",
      "start_time": "2026-06-21T00:00:00Z",
      "end_time": "2026-06-21T00:00:00.042000Z",
      "duration_ms": 42,
      "status_code": "ok",
      "source": "api",
      "attributes": {"service": "api"},
      "payload": {"route": "/health"},
      "occurred_at": "2026-06-21T00:00:00Z",
      "received_at": "2026-06-21T00:00:01Z"
    }
  ],
  "next_cursor": null
}
```

- 分页规则：按 `received_at`、`id` 倒序返回；游标编码包含查询类型、当前筛选条件（含规范化后的 `trace_id`、`span_id`、`status_code` 和 `duration_min_ms` / `duration_max_ms`）、`received_at` 和 `id`，避免同一接收时间记录翻页重复或漏项。Trace 游标只能用于 trace 查询，并且必须匹配当前筛选条件；非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`，不暴露内部解码细节。前端修改筛选条件时应丢弃旧游标并重新查询第一页。
- 当前查询来源：关系库 `ingest_records` 的 `kind=trace` 记录；响应字段从 T-0044 trace payload 顶层关键字段展开，业务 `payload` 和 `attributes` 保留为对象，不默认展开 `raw`。带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；`status_code` 按 trace payload 顶层字符串精确匹配，`duration_min_ms` / `duration_max_ms` 按 trace payload 顶层 `duration_ms` 数值比较；`occurred_from` / `occurred_to` 用 span `start_time` 入库后的 `occurred_at` 做范围过滤，但列表排序和 cursor 沿用既有查询 API 的 `received_at` + `id` 稳定排序。ClickHouse trace 查询、跨信号关联和日志互跳后续补齐；服务拓扑最小查询见 API-0022。

## API-0022 Trace 服务拓扑查询

- `GET /api/v1/query/traces/topology`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：必填，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按 trace span `occurred_at` 过滤；trace 摄入时该字段来自 span `start_time`。
  - `source`：可选，来源，长度 `1..128`；后端会去除前后空白，空白字符串按未传处理。传入后返回该 source 及其相邻 source 组成的子图。
  - `limit`：可选，默认 `100`，范围 `1..500`；限制返回节点数，并且只返回两端节点都在返回节点集合中的边。该参数不控制数据库读取条数；数据库侧扫描窗口由 `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT` 控制，默认最多读取 `10000` 条匹配 span。
- 响应：`nodes` 为服务节点数组，`edges` 为 source-to-source 调用边数组；本接口不返回 cursor。

```json
{
  "nodes": [
    {
      "source": "api",
      "span_count": 12,
      "trace_count": 4,
      "error_span_count": 2,
      "avg_duration_ms": 38.5,
      "max_duration_ms": 120
    }
  ],
  "edges": [
    {
      "from_source": "api",
      "to_source": "worker",
      "call_count": 6,
      "error_count": 1,
      "avg_duration_ms": 24.5,
      "max_duration_ms": 70
    }
  ]
}
```

- 推导规则：查询来源为关系库 `ingest_records.kind=trace`，repository 查询会按 `project_id`、权限项目集合和时间范围过滤、按 `project_id,id` 升序排序，并应用 `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT` 数据库侧 `LIMIT`。后端把 trace span 的 `source` 作为服务节点；在同一 `trace_id` 内，若 child span 的 `parent_span_id` 指向 parent span 的 `span_id`，且 parent/child 都有非空 `source` 且不同，则形成 `from_source -> to_source` 边。缺 parent、缺 source 或同 source parent-child 不生成边。同一 `trace_id` 内若多个 span 共享同一个 `span_id`，该 parent id 视为 ambiguous；child 指向该 parent id 时跳过 edge，不用第一条或任意一条 span 推导边，避免因摄入顺序造成误归属。节点统计仍包含这些 span 本身。
- 聚合规则：节点按 source 汇总 `span_count`、去重 `trace_count`、`error_span_count`、`avg_duration_ms` 和 `max_duration_ms`；边按 `(from_source, to_source)` 汇总 `call_count`、`error_count`、`avg_duration_ms` 和 `max_duration_ms`。错误计数当前按 trace payload 顶层 `status_code` 规范化后等于 `error` 统计；duration 聚合使用 trace payload 顶层 `duration_ms`，缺失或非有限值不参与平均和最大值。
- 排序规则：节点默认按 `span_count` 降序、`source` 升序返回；传入 `source` 时目标 source 排在首位。边按 `call_count` 降序、`from_source`、`to_source` 升序返回。
- 当前边界：不接 ClickHouse，不做前端拓扑图，不做复杂布局，不做跨项目聚合，不做任意标签拓扑。

## API-0018 日志上下文查询

- `GET /api/v1/query/logs/{log_id}/context`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 路径参数：
  - `log_id`：正整数；目标必须是 `ingest_records.kind=log` 记录。
- 查询参数：
  - `before`：可选，默认 `5`，范围 `0..20`。
  - `after`：可选，默认 `5`，范围 `0..20`。
- 响应：`target` 为目标日志，`before` 为目标之前日志数组，`after` 为目标之后日志数组。`before` 和 `after` 均按时间正序返回，前端可按 `before + target + after` 直接展示。

```json
{
  "target": {
    "id": 2,
    "project_id": 1,
    "level": "error",
    "message": "retry failed",
    "source": "worker",
    "logger": "deploy.worker",
    "trace_id": "trace-1",
    "span_id": "span-2",
    "attributes": {"service": "api"},
    "payload": {"attempt": 3},
    "occurred_at": "2026-06-21T00:00:02Z",
    "received_at": "2026-06-21T00:00:03Z"
  },
  "before": [
    {
      "id": 1,
      "project_id": 1,
      "level": "info",
      "message": "deployment started",
      "source": "worker",
      "logger": "deploy.worker",
      "trace_id": "trace-1",
      "span_id": "span-1",
      "attributes": {},
      "payload": {},
      "occurred_at": "2026-06-21T00:00:00Z",
      "received_at": "2026-06-21T00:00:01Z"
    }
  ],
  "after": []
}
```

- 权限与隐藏：当前用户只能访问自己拥有项目角色的日志。目标日志不存在、不是日志记录，或用户无目标项目权限时，统一返回 `404 日志不存在`，不暴露跨项目日志 ID 是否存在。
- 上下文边界：上下文限定与目标相同 `project_id` 且 `kind=log`；不要求同 `source` 或 `level`，不跨项目，不包含 events/metrics。
- 排序规则：基于 `received_at` + `id` 作为稳定排序锚点，与日志列表分页字段一致。`before` 取早于目标的最多 `before` 条，`after` 取晚于目标的最多 `after` 条；同一 `received_at` 下使用 `id` 打破并列。
- 错误：
  - `401`：缺少或无效 Bearer 用户 token。
  - `404 日志不存在`：目标日志不存在、不是日志或无目标项目权限。
  - `422`：`log_id` 非正整数，或 `before` / `after` 超出 `0..20`。
- 当前查询来源：关系库 `ingest_records` 的 `kind=log` 记录，并由 `(project_id, kind, received_at, id)` 组合索引支撑前后窗口过滤与排序；ClickHouse 日志上下文、全文搜索窗口和更复杂字段过滤后续补齐。

## API-0019 指标聚合窗口查询

- `GET /api/v1/query/metrics/aggregate`
- 鉴权：`Authorization: Bearer <access_token>`，需为启用用户。
- 查询参数：
  - `project_id`：可选，正整数；普通用户只能查询自己有项目角色的项目；显式指定不存在或无权项目返回 `404 项目不存在`，超级用户也必须指向已存在项目。
  - `name`：可选，指标名，长度 `1..128`。
  - `source`：可选，来源，长度 `1..128`。
  - `occurred_from` / `occurred_to`：可选，ISO 8601 时间范围，按指标 `occurred_at` 过滤。
  - `window`：可选，固定窗口，默认 `5m`；本小步只支持 `1m`、`5m`、`15m`、`1h`。
  - `aggregation`：可选，默认 `avg`；本小步只支持 `avg`、`sum`、`min`、`max`、`count`。
  - `limit`：可选，默认 `100`，范围 `1..500`，限制返回窗口点数量。
- 响应：统一对象，`items` 为聚合点数组；本接口不返回 cursor，不改变 `GET /api/v1/query/metrics` 样本列表 envelope。

```json
{
  "items": [
    {
      "project_id": 1,
      "name": "http.requests",
      "source": "api",
      "window_start": "2026-06-21T00:00:00Z",
      "window_end": "2026-06-21T00:05:00Z",
      "aggregation": "avg",
      "value": 12.5,
      "sample_count": 4,
      "unit": "count"
    }
  ]
}
```

- 分组规则：按 `project_id`、`name`、`source`、窗口开始时间聚合；`unit` 当前取同一窗口内可见样本的最小非空 unit，若混合 unit 则后续单独处理，不在本小步引入单位换算。
- 当前查询来源：关系库 `ingest_records` 的 `kind=metric` 记录和 JSON payload 中的 `value`；只聚合有 `occurred_at` 的指标样本，窗口按 Unix epoch 固定分桶。SQLite 使用 epoch seconds，MySQL/MariaDB 使用 `TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', occurred_at)` 计算 UTC 存储时间相对 Unix epoch 的秒差，并显式 `FLOOR(epoch / window_seconds) * window_seconds` 下取整到窗口起点，避免 `UNIX_TIMESTAMP(DATETIME)` 受数据库 session time zone 影响，也避免真实 MySQL 下 `00:00:59`、`00:04:59` 等边界样本上浮到下一桶；暂不接 ClickHouse、group by tags、percentile、Top N、单位换算、降采样或多序列对比。

## 持久化实现与迁移

- 当前实现位于 `backend/app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`。
- 认证实现位于 `backend/app/services/auth.py`、`backend/app/repositories/auth.py`、`backend/app/api/routes/auth.py`，默认使用 `SqlAlchemyAuthRepository`。
- API Key 实现位于 `backend/app/services/api_keys.py`、`backend/app/repositories/api_keys.py`、`backend/app/api/routes/api_keys.py`，默认使用 `SqlAlchemyApiKeyRepository`。
- Dashboard 实现位于 `backend/app/services/dashboard.py`、`backend/app/repositories/dashboard.py`、`backend/app/api/routes/dashboard.py`，默认使用 `SqlAlchemyDashboardRepository`。
- Alert Rules 实现位于 `backend/app/services/alerts.py`、`backend/app/repositories/alerts.py`、`backend/app/api/routes/alerts.py`，默认使用 `SqlAlchemyAlertRuleRepository`；手动评估和到期扫描复用 `SqlAlchemyQueryRepository.aggregate_metric_window()` 读取关系库指标样本；当前状态保存到 `alert_evaluation_states`。
- 摄入实现位于 `backend/app/services/ingest.py`、`backend/app/repositories/ingest.py`、`backend/app/api/routes/ingest.py`，默认使用 `SqlAlchemyIngestRepository`。
- 查询实现位于 `backend/app/services/query.py`、`backend/app/repositories/query.py`、`backend/app/api/routes/query.py`，当前事件/日志/指标/trace 查询默认使用 `SqlAlchemyQueryRepository`。
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
  - `backend/migrations/versions/20260622_0007_add_ingest_records_query_index.py`
  - `backend/migrations/versions/20260622_0008_ingest_records_mysql_microseconds.py`
  - `backend/migrations/versions/20260623_0009_create_dashboards.py`
  - `backend/migrations/versions/20260626_0010_create_alert_rules.py`
  - `backend/migrations/versions/20260627_0011_create_alert_evaluation_states.py`
- MySQL 目标表：
  - `management_projects`：项目，`key` 全局唯一。
  - `management_environments`：环境，外键 `project_id`，同项目下 `key` 唯一，并提供 `(id, project_id)` 唯一约束供服务复合外键引用。
  - `management_services`：服务，外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键保证服务引用的环境属于同一项目，同环境下 `key` 唯一。
  - `auth_users`：本地登录用户，`username` 唯一，`email` 唯一且可为空，密码仅保存 `pwdlib[argon2]` 哈希。
  - `rbac_teams`：团队，`key` 全局唯一。
  - `rbac_team_members`：团队成员，外键 `team_id`、`user_id`，同团队同用户唯一。
  - `rbac_project_members`：项目成员角色，外键 `project_id`、`user_id`，同项目同用户唯一，`role` 取 `viewer`、`editor`、`admin`。
  - `api_keys`：项目 API Key，外键 `project_id`、`created_by_user_id`，`key_hash` 全局唯一，保存 `status`、`revoked_at`、`last_used_at` 和展示前缀。
  - `dashboards`：项目 dashboard，外键 `project_id`、`created_by_user_id`、`updated_by_user_id`，保存 `name`、`description`、`layout` JSON、`config` JSON、`created_at`、`updated_at`；组合索引 `ix_dashboards_project_updated_at_id(project_id, updated_at, id)` 支撑按项目更新时间分页。
  - `alert_rules`：项目告警规则，外键 `project_id`、`created_by_user_id`、`updated_by_user_id`，保存 `name`、`description`、`enabled`、`severity`、`signal`、`condition` JSON、`evaluation` JSON、`created_at`、`updated_at`；同项目下 `name` 唯一，组合索引 `ix_alert_rules_project_updated_at_id(project_id, updated_at, id)` 支撑按项目更新时间分页。
  - `alert_evaluation_states`：告警当前评估状态，外键 `rule_id`、`project_id`，按 `rule_id` 唯一保存当前 `status`、`last_evaluated_at`、`next_evaluate_at`、`last_result` JSON、`last_error`、`created_at`、`updated_at`；组合索引 `ix_alert_evaluation_states_project_next_at(project_id, next_evaluate_at, rule_id)` 支撑后续到期扫描。
  - `ingest_records`：最小摄入记录，外键 `project_id`、`api_key_id`，保存 `kind`、`event_type`、`source`、`payload` JSON、`occurred_at` 和 `received_at`；MySQL/MariaDB 下 `occurred_at` 和 `received_at` 使用 `DATETIME(6)`，`received_at` 默认值为 `CURRENT_TIMESTAMP(6)`；组合索引 `ix_ingest_records_project_kind_received_at_id(project_id, kind, received_at, id)` 支撑日志上下文 before/after 和带项目过滤的查询分页。
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
- 验证边界：已用 SQLite 覆盖 API 契约、唯一约束错误映射、服务项目/环境复合外键归属约束、未知 `IntegrityError` 映射、密码非明文保存、登录成功/失败、未知用户 dummy hash 校验、未配置/弱/有效 `AUTH_SECRET_KEY`、HTTP Bearer OpenAPI 描述、当前用户依赖识别 token 用户、项目创建后创建者获得 `admin`、创建者授权失败时项目创建回滚、无权限跨项目环境 ID 不泄露且不能创建服务、未授权用户无法读取他人项目、`viewer` 只读、`editor` 可创建环境/服务、`admin`/superuser 可管理、停用用户被拒绝、API Key 明文只在创建响应出现、`key_hash` 不等于明文、列表/撤销不返回明文或哈希、无项目成员关系的普通用户无法通过 API Key 管理端点区分项目存在性、`viewer`/`editor` 被 API Key 创建/列表/撤销拒绝、撤销后 `verify_key()` 失败、dashboard CRUD 成功路径、dashboard 项目权限隔离、viewer/editor/superuser 角色边界、无权限项目和跨项目 dashboard ID 隐藏、dashboard `layout/config` 对象或数组校验、大小/深度/复杂度限制、非有限数拒绝、partial update 未传 JSON 字段保持原值、空对象/空数组更新语义、空 patch 拒绝、limit/offset 分页、SQLite dashboard 迁移升降级和 MySQL dashboard JSON DDL 编译、告警规则 CRUD 成功路径、全局列表项目权限过滤、viewer/editor/superuser 角色边界、无权限项目和跨项目 rule ID 隐藏、viewer 写入 `403`、同项目名称重复 `409`、severity/signal/condition/evaluation/空 patch/limit/offset 校验 `422`、告警规则手动评估 firing/ok/no_data/disabled、非 metrics `422`、非法 condition `422`、viewer 可评估但不能写入、无权限/跨项目/不存在隐藏、SQLite alert_rules 迁移升降级、MySQL alert_rules JSON DDL 编译、缺失项目/无权限项目行为、events/metrics/logs/traces 摄入 API 使用 `Authorization: Bearer <api_key>` 与 `X-API-Key` 绑定项目、缺失/无效/撤销 API Key 拒绝、启用后摄入 API Key 固定窗口限流返回 `429`、成功摄入后统计聚合、已验证 API Key 后的验证失败/限流拒绝统计、trace spans 摄入绑定 API Key 项目、`kind=trace` 写入、trace payload/raw span 持久化、trace duration/time 校验、trace 非有限值拒绝、trace 验证失败/限流拒绝按 `kind=trace` 统计、统计查询项目权限过滤、事件/日志/指标/trace 查询 API 权限过滤、基础筛选和基于 `received_at` + `id` 的游标分页、trace 查询从 payload 顶层关键字段展开 span、按 `trace_id`/`span_id`/`name`/`source`/时间范围过滤、trace cursor 筛选签名不匹配返回 `422`、SQLite/MySQL/MariaDB trace 顶层 JSON 字段 SQL 编译、日志关键词命中 message/业务 payload 值文本、业务 payload key-only 不命中、不命中 wrapper key 与 null 脚手架、SQLite 递归命中业务 payload 嵌套/数组值、LIKE 通配符按字面匹配、与 level/source/time/project 权限叠加、keyword 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志 `trace_id`/`span_id` 顶层结构化字段精确过滤、trim 后空白按未传处理、与 keyword/level/source/project 权限叠加，以及 trace/span 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志 `request_id`/`user_id` 结构化 `attributes` 白名单字段精确过滤、trim 后空白按未传处理、业务 `payload` 同名字段不误命中、与 keyword/level/source/trace/span/project 权限叠加，以及 request/user 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志上下文同项目前后文、无权限/不存在隐藏和 `before`/`after` 参数校验、指标聚合窗口 avg/sum/min/max/count、窗口分桶、权限过滤、name/source/time 组合筛选、空结果、非法 window/aggregation、limit 和未登录拒绝、MySQL/MariaDB 指标聚合窗口 SQL 编译为 `FLOOR(TIMESTAMPDIFF(...) / window_seconds)` UTC epoch 秒差下取整且不使用 `UNIX_TIMESTAMP(occurred_at)`、`ingest_records(project_id, kind, received_at, id)` 组合索引元数据与 SQLite 迁移结果、`ingest_records.kind` 字符串列兼容 `trace` kind、非法/跨查询类型/不匹配筛选条件游标 `422`、payload/tags/attributes 校验错误返回 `422`、metrics 非有限 value 拒绝、logs message 长度限制、顶层 `project_id` 不能覆盖归属、嵌套业务载荷中的跨项目 `project_id` 不影响 API Key 项目上下文和 Alembic 升降级；真实 MySQL 联测已发现并修复指标窗口未显式下取整时 `00:00:59`、`00:04:59` 上浮到下一桶的问题；ClickHouse 已覆盖 compose 配置展开、init SQL 挂载路径和预期表名静态检查；MongoDB 已覆盖 compose 配置展开、init 脚本挂载路径、events 集合和预期索引静态检查。真实 MySQL 回归测试覆盖项目创建授权事务回滚、跨项目 environment_id 非泄露和临时库清理，后续仍可继续扩展 migration、外键、唯一索引、JSON 字段、用户唯一约束、RBAC 约束、API Key 约束、dashboard/alert_rules 迁移/API CRUD 和摄入记录写入/统计聚合/事件/日志/指标/trace 摄入查询分页/日志上下文/日志关键词搜索/日志结构化字段过滤/指标窗口聚合/告警手动评估的 MySQL 专项用例，尤其是 MySQL dashboard/alert_rules JSON 列读写、业务 payload 非字符串 JSON 标量值、日志 attributes 白名单字段 JSON 精确过滤执行计划、trace 真实 MySQL 写入/统计/查询执行计划、指标窗口聚合执行计划和告警评估单窗口聚合执行计划；真实 ClickHouse/MongoDB/Redis 容器初始化与写入链路仍需后续补验。
- 安全边界：认证接口接收密码并返回 token，但代码未输出请求体日志；API Key 创建接口会返回一次性明文，后续结构化日志必须脱敏 `password`、`access_token`、`Authorization`、Cookie、数据库连接串、API Key 和通知 Webhook 密钥。当前尚未开放团队/成员管理或项目授权 API，后续需补管理员授权入口、审计日志、API Key 使用审计和危险动作 `admin` 校验。
