# 前端 API 需求草案

前端开发 agent 在本文件追加接口需求、字段需求、错误码需求和筛选分页需求。总 agent 负责与后端草案对齐后合并到 `AGENT_COMMUNICATION.md` 的正式契约表。

## 2026-06-20 T-0015-authenticated-settings-client Settings 认证接入

- task: T-0015-authenticated-settings-client
- owner: frontend-agent
- scope: 阶段 1 Settings/基础管理 API client 接入当前 session token，并处理未登录与 `401`。
- status: frontend-ready

### Settings 管理接口认证行为

- affected endpoints:
  - `GET /api/v1/projects`
  - `POST /api/v1/projects`
  - `GET /api/v1/environments`
  - `POST /api/v1/environments`
  - `GET /api/v1/services`
  - `POST /api/v1/services`
- request header:
  - 登录成功或从 `sessionStorage` 恢复到 session 后，前端 API client 会在请求中携带 `Authorization: Bearer <access_token>`。
  - 当前没有 session token 或 session 仍在恢复确认时，`/settings` 不主动请求上述管理接口，并在页面级提示登录。
- error response:
  - `401 Unauthorized`: token 缺失、过期或无效；Settings 页面展示登录状态已过期/请重新登录的页面级提示，并提供登录入口。
  - `403 Forbidden`: token 有效但无管理资源权限；仍按页面级或表单级权限不足文案展示，不清理本地 session。
- frontend behavior:
  - 本轮不增加全站路由守卫；仅 Settings 页面根据登录状态控制管理接口请求、刷新入口和创建提交入口。
  - Settings 列表读取或创建表单返回 `401` 时，统一汇总为 Settings 页面级认证提示。
  - 普通管理表单不会把 `401` 展示为账号或密码错误；账号密码错误文案仅保留给 `/login` 登录表单上下文。
  - `404`、`409`、`422` 等业务错误继续保留原有表单级展示。

## 2026-06-20 T-0013-auth-ui-shell 认证接口草案

- task: T-0013-auth-ui-shell
- owner: frontend-agent
- scope: 阶段 1 登录页、前端认证状态和认证 API client。
- status: frontend-draft

### API-FE-0005 登录

- endpoint: `POST /api/v1/auth/login`
- request body:
  - `username`: string，必填；前端提交前会 `trim`。
  - `password`: string，必填；前端仅用于请求体，不写入日志、URL 或页面状态外的持久文档。
- expected success response:
  - `access_token`: string，必填。
  - `token_type`: string，可选；缺省按 `Bearer` 处理。
  - `expires_in`: number，可选，秒。
  - `user`: object，可选；若缺省，前端会在恢复会话或后续刷新时调用 `/api/v1/auth/me`。
- expected user fields:
  - `id`: number|string
  - `username`: string
  - `display_name`: string|null，可选
  - `email`: string|null，可选
  - `roles`: string[]，可选
- error response:
  - `401 Unauthorized`: 账号或密码错误。
  - `403 Forbidden`: 账号被禁用、无权登录或认证策略拒绝。
  - `422 Unprocessable Entity`: 请求体字段格式错误。
- frontend behavior:
  - 登录成功后将 `Authorization: Bearer <token>` 注入后续 API 请求。
  - 登录页使用登录专用错误文案；`401` 展示为账号或密码错误，不复用普通表单的登录过期文案。
  - 当前阶段暂不强制保护全站路由；`/login` 可独立访问，控制台侧栏显示认证状态。

### API-FE-0006 当前用户

- endpoint: `GET /api/v1/auth/me`
- request header:
  - `Authorization: Bearer <access_token>`
- expected success response: 同 `user` 字段。
- error response:
  - `401 Unauthorized`: token 缺失、过期或无效；前端会清理本地会话。
  - `403 Forbidden`: token 有效但无权访问当前资源；前端按错误展示处理。
- frontend behavior:
  - 从 `sessionStorage` 恢复到 token 但没有 user 时，会调用该接口补齐用户信息。
  - 仅当 `/me` 返回 `401 Unauthorized` 时清理前端会话和本地 token。
  - `403 Forbidden`、`503 Service Unavailable`、网络错误或超时会保留本地 token，并通过认证状态展示可恢复错误，避免误清仍有效的 session。
  - 后端尚未提供 refresh/logout 契约，本轮不假设刷新接口，也不调用服务端 logout。

### 临时安全边界

- 当前前端最小壳使用 `sessionStorage` 保存 `accessToken`、`tokenType` 和非敏感用户展示信息，仅用于阶段 1 后端契约未最终集成前的本地会话恢复。
- `sessionStorage` 中的 token 仍可被同源 XSS 读取；这不是最终生产安全方案。后续应优先评估 HttpOnly、Secure、SameSite Cookie 或短期 access token + refresh token 的后端托管方案。
- 前端不得把 password、access token、cookie、API key 或后端返回的敏感认证 detail 写入运行日志、文档示例或 URL。

## 2026-06-20 T-0009 错误展示联调准备

- task: T-0009
- owner: frontend-agent
- scope: Settings/基础管理页面项目、环境、服务列表与创建。
- request fields: 无新增字段；继续使用后端契约的 `key`，服务创建继续要求 `environment_id` 必填。
- supported error body:
  - `{"detail":"错误说明"}`：直接展示错误说明。
  - `{"detail":[{"loc":["body","key"],"msg":"错误说明"}]}`：展示 `body.key: 错误说明`，最多合并前三条。
  - `{"detail":{"key":"错误说明","environment_id":"错误说明"}}`：展示 `key: 错误说明；environment_id: 错误说明`，最多合并前三条。
- page-level display:
  - `404 Not Found`: 接口或资源不存在，请确认后端基础管理接口已启用，并追加后端 `detail`。
  - `409 Conflict`: 资源状态冲突，请刷新后重试，并追加后端 `detail`。
  - `422 Unprocessable Entity`: 请求参数未通过校验，请刷新页面后重试，并追加后端 `detail`。
- form-level display:
  - `404 Not Found`: 关联资源不存在，请刷新列表后重试，并追加后端 `detail`。
  - `409 Conflict`: 资源标识已存在或关联关系冲突，请调整后重试，并追加后端 `detail`。
  - `422 Unprocessable Entity`: 表单字段未通过校验，请按提示修正，并追加后端 `detail`。
- status: frontend-ready

## 2026-06-20 T-0007-fix 契约对齐说明

- 已读取后端 T-0006 契约：`C:\Users\q-lau\Documents\telemetry-worktrees\backend\agents\runtime\api-contracts\backend.md`。
- 前端 Settings/基础管理页面已从旧草案的 `slug` 调整为后端契约字段 `key`。
- 服务创建已按后端契约要求将 `environment_id` 作为必填字段，并要求该环境所属项目等于 `project_id`。
- 以下 API-FE-0002 到 API-FE-0004 已与后端 T-0006 当前契约对齐；分页、认证和持久化能力仍以后端后续任务为准。

## API-FE-0002 基础管理项目列表与创建

- task: T-0007-fix
- owner: frontend-agent
- aligned backend contract: API-0002 项目管理
- endpoints:
  - `GET /api/v1/projects`
  - `POST /api/v1/projects`
- list query: 暂无；后端当前返回全部项目。
- create request:
  - `name`: string，必填，1 到 100 字符
  - `key`: string，必填，2 到 64 字符，匹配 `^[a-z][a-z0-9_-]*$`，全局唯一
  - `description`: string，可选，最多 500 字符
  - `status`: `active` | `inactive` | `archived`，可选，后端默认 `active`；前端当前不暴露该字段
- item response:
  - `id`: number
  - `name`: string
  - `key`: string
  - `description`: string | null
  - `status`: `active` | `inactive` | `archived`
  - `created_at`: string，ISO 8601
- list response: 后端当前返回 `Project[]`；前端仍兼容 `{ items }`、`{ data }`、`{ results }` 包装。
- error response:
  - `409 Conflict`: 项目 `key` 已存在
  - `422 Unprocessable Entity`: 请求体字段格式错误
- auth: 要求当前 session token；前端随请求携带 `Authorization: Bearer <access_token>`，无 token 时 Settings 页面不主动请求。
- status: aligned

## API-FE-0003 基础管理环境列表与创建

- task: T-0007-fix
- owner: frontend-agent
- aligned backend contract: API-0003 环境管理
- endpoints:
  - `GET /api/v1/environments`
  - `POST /api/v1/environments`
- list query:
  - `project_id`: number，可选，传入后只返回该项目下环境
- create request:
  - `project_id`: number，必填，必须引用已存在项目
  - `name`: string，必填，1 到 100 字符
  - `key`: string，必填，2 到 64 字符，匹配 `^[a-z][a-z0-9_-]*$`，同项目内唯一
  - `description`: string，可选，最多 500 字符
  - `status`: `active` | `inactive` | `archived`，可选，后端默认 `active`；前端当前不暴露该字段
- item response:
  - `id`: number
  - `project_id`: number
  - `name`: string
  - `key`: string
  - `description`: string | null
  - `status`: `active` | `inactive` | `archived`
  - `created_at`: string，ISO 8601
- list response: 后端当前返回 `Environment[]`；前端仍兼容 `{ items }`、`{ data }`、`{ results }` 包装。
- error response:
  - `404 Not Found`: 项目不存在
  - `409 Conflict`: 同项目下环境 `key` 已存在
  - `422 Unprocessable Entity`: 请求体字段格式错误
- auth: 要求当前 session token；前端随请求携带 `Authorization: Bearer <access_token>`，无 token 时 Settings 页面不主动请求。
- status: aligned

## API-FE-0004 基础管理服务列表与创建

- task: T-0007-fix
- owner: frontend-agent
- aligned backend contract: API-0004 服务管理
- endpoints:
  - `GET /api/v1/services`
  - `POST /api/v1/services`
- list query:
  - `project_id`: number，可选，传入后只返回该项目下服务
  - `environment_id`: number，可选，传入后只返回该环境下服务
- create request:
  - `project_id`: number，必填，必须引用已存在项目
  - `environment_id`: number，必填，必须引用已存在环境
  - `environment_id` 所属项目必须等于 `project_id`
  - `name`: string，必填，1 到 100 字符
  - `key`: string，必填，2 到 64 字符，匹配 `^[a-z][a-z0-9_-]*$`，同环境内唯一
  - `description`: string，可选，最多 500 字符
  - `status`: `active` | `inactive` | `archived`，可选，后端默认 `active`；前端当前不暴露该字段
- item response:
  - `id`: number
  - `project_id`: number
  - `environment_id`: number
  - `name`: string
  - `key`: string
  - `description`: string | null
  - `status`: `active` | `inactive` | `archived`
  - `created_at`: string，ISO 8601
- list response: 后端当前返回 `Service[]`；前端仍兼容 `{ items }`、`{ data }`、`{ results }` 包装。
- error response:
  - `404 Not Found`: 项目或环境不存在
  - `409 Conflict`: 环境所属项目不匹配，或同环境下服务 `key` 已存在
  - `422 Unprocessable Entity`: 请求体字段格式错误
- auth: 要求当前 session token；前端随请求携带 `Authorization: Bearer <access_token>`，无 token 时 Settings 页面不主动请求。
- status: aligned
