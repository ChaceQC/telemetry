# 前端 API 需求草案

前端开发 agent 在本文件追加接口需求、字段需求、错误码需求和筛选分页需求。总 agent 负责与后端草案对齐后合并到 `AGENT_COMMUNICATION.md` 的正式契约表。

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
- auth: 阶段 1 临时开放；后续接入认证后要求管理后台登录态和项目读取/创建权限。
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
- auth: 阶段 1 临时开放；后续接入认证后要求项目读取/环境管理权限。
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
- auth: 阶段 1 临时开放；后续接入认证后要求项目或环境读取/服务管理权限。
- status: aligned
