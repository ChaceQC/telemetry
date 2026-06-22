# 前端 API 需求草案

前端开发 agent 在本文件追加接口需求、字段需求、错误码需求和筛选分页需求。总 agent 负责与后端草案对齐后合并到 `AGENT_COMMUNICATION.md` 的正式契约表。

## 2026-06-22 T-0043 日志 Request ID / User ID 字段过滤基础

- task: T-0043
- owner: frontend-agent / backend-agent
- scope: `/logs` 查询表单新增 Request ID 与 User ID 精确筛选，并接入日志查询 API。
- status: frontend-ready

### 日志查询 Request/User 字段契约

- endpoint: `GET /api/v1/query/logs`
- auth: 沿用现有查询 API client，前端随请求携带 `Authorization: Bearer <access_token>`。
- request query:
  - 保留现有 `project_id`、`level`、`keyword`、`trace_id`、`span_id`、`source`、`occurred_from`、`occurred_to`、`limit` 和 `cursor`。
  - 新增可选 `request_id`: string，前端 trim 空白，空值不传；后端按日志结构化字段 `request_id` 精确匹配。
  - 新增可选 `user_id`: string，前端 trim 空白，空值不传；后端按日志结构化字段 `user_id` 精确匹配。
  - 本小步不新增任意 payload 字段过滤。
- response body: 不变，继续使用查询 envelope。

```json
{
  "items": [],
  "next_cursor": null
}
```

- frontend behavior:
  - `/logs` 筛选表单显示 Request ID 与 User ID 输入，提交后请求 `GET /api/v1/query/logs?...&request_id=...&user_id=...`。
  - `request_id` 和 `user_id` 只影响 logs；`/metrics` 和 `/events` 表单不显示这些字段，API client 也不会向对应接口透传误传字段。
  - 提交筛选、点击刷新和翻页时沿用现有分页状态模式；提交或刷新会清空旧 `cursor` 回到第一页，下一页请求会携带当前 `request_id`、`user_id` 和上一页 `next_cursor`。
  - 不改变响应 envelope，不新增依赖，不做完整前后端联测。

## 2026-06-22 T-0042 Metrics 聚合窗口基础

- task: T-0042
- owner: frontend-agent / backend-agent
- scope: `/metrics` 查询页新增聚合窗口控件和聚合结果视图，接入独立指标聚合 API。
- status: draft-aligned

### Metrics 聚合 API 契约

- endpoint: `GET /api/v1/query/metrics/aggregate`
- auth: 沿用现有查询 API client，前端随请求携带 `Authorization: Bearer <access_token>`。
- request query:
  - 保留 metrics 查询相关筛选：`project_id`、`name`、`source`、`occurred_from`、`occurred_to`。
  - 新增可选 `window`: `1m | 5m | 15m | 1h`，默认 `5m`。
  - 新增可选 `aggregation`: `avg | sum | min | max | count`，默认 `avg`。
  - 可选 `limit`: number，默认 `100`，范围由后端限制。
  - 本接口不使用 `cursor`；现有 `GET /api/v1/query/metrics` 样本列表和分页行为不变。
- response body:

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

- frontend behavior:
  - `/metrics` 筛选区增加窗口和聚合方式控件；`/logs` 与 `/events` 不显示、不透传这些字段。
  - `/metrics` 结果区在当前页趋势之外新增聚合摘要/图表区域，读取独立 aggregate API；样本列表仍使用现有 metrics 查询和分页。
  - 提交筛选或刷新时同时刷新样本查询和聚合查询；聚合查询不影响样本列表 cursor。
  - 不新增重量级图表库；优先复用当前轻量 SVG/表格模式。

## 2026-06-22 T-0041 日志结构化字段过滤基础

- task: T-0041
- owner: frontend-agent / backend-agent
- scope: `/logs` 查询表单新增 Trace ID 与 Span ID 精确筛选，并接入日志查询 API。
- status: frontend-ready

### 日志查询结构化字段契约

- endpoint: `GET /api/v1/query/logs`
- auth: 沿用现有查询 API client，前端随请求携带 `Authorization: Bearer <access_token>`。
- request query:
  - 保留现有 `project_id`、`level`、`keyword`、`source`、`occurred_from`、`occurred_to`、`limit` 和 `cursor`。
  - 新增可选 `trace_id`: string，前端 trim 空白，空值不传；后端按日志顶层结构化字段 `trace_id` 精确匹配。
  - 新增可选 `span_id`: string，前端 trim 空白，空值不传；后端按日志顶层结构化字段 `span_id` 精确匹配。
  - 本小步不新增 `request_id`，不做任意 payload 字段过滤。
- response body: 不变，继续使用查询 envelope。

```json
{
  "items": [],
  "next_cursor": null
}
```

- frontend behavior:
  - `/logs` 筛选表单显示 Trace ID 与 Span ID 输入，提交后请求 `GET /api/v1/query/logs?...&trace_id=...&span_id=...`。
  - `trace_id` 和 `span_id` 只影响 logs；`/metrics` 和 `/events` 表单不显示这些字段，API client 也不会向对应接口透传误传字段。
  - 提交筛选、点击刷新和翻页时沿用现有分页状态模式；提交或刷新会清空旧 `cursor` 回到第一页，下一页请求会携带当前 `trace_id`、`span_id` 和上一页 `next_cursor`。
  - 不改变响应 envelope，不新增依赖，不做完整前后端联测。

## 2026-06-22 T-0040 Events 时间线展示基础

- task: T-0040
- owner: frontend-agent
- scope: `/events` 查询页将当前结果列表增强为事件时间线展示。
- status: frontend-ready

### API 契约影响

- 不新增后端接口、请求参数或响应 envelope。
- 继续使用既有 `GET /api/v1/query/events`。
- request query: 保留现有 `project_id`、`type`、`source`、`occurred_from`、`occurred_to`、`limit` 和 `cursor`。
- response body: 不变，继续使用查询 envelope。

```json
{
  "items": [],
  "next_cursor": null
}
```

- event item fields: 前端仅使用现有 `id`、`project_id`、`type`、`source`、`payload`、`occurred_at`、`received_at`。
- frontend behavior:
  - `/events` 结果区展示为当前页事件时间线，保留 API 返回顺序，不在前端重新排序，也不重新解释分页语义。
  - 每条事件展示事件类型、source、occurred/received 时间、项目 ID、事件 ID、payload 摘要和可展开 JSON 预览；`occurred_at` 缺失时展示 `received_at` 作为 occurred fallback。
  - `/metrics` 和 `/logs` 保持现有结果列表展示；`/metrics` 当前页趋势图和 `/logs` 上下文面板不受影响。
  - 筛选、刷新、分页、错误/空态和登录保护逻辑不变。

## 2026-06-22 T-0039 日志关键词搜索基础前端

- task: T-0039
- owner: frontend-agent
- scope: `/logs` 查询表单新增关键词筛选，并接入既有日志查询 API。
- status: frontend-ready

### 日志查询 keyword 契约

- endpoint: `GET /api/v1/query/logs`
- auth: 沿用现有查询 API client，前端随请求携带 `Authorization: Bearer <access_token>`。
- request query:
  - 保留现有 `project_id`、`level`、`source`、`occurred_from`、`occurred_to`、`limit` 和 `cursor`。
  - 新增可选 `keyword`: string；前端会 trim 空白，空值不传。
- response body: 不变，继续使用查询 envelope。

```json
{
  "items": [],
  "next_cursor": null
}
```

- frontend behavior:
  - `/logs` 筛选表单显示“关键词”输入，提交后请求 `GET /api/v1/query/logs?...&keyword=...`。
  - `keyword` 只影响 logs；`/metrics` 和 `/events` 表单不显示该字段，API client 也不会向对应接口透传误传的 `keyword`。
  - 提交筛选、点击刷新和翻页时沿用现有分页状态模式；提交或刷新会清空旧 `cursor` 回到第一页，下一页请求会携带当前 keyword 和上一页 `next_cursor`。
  - 不改变响应 envelope，不新增依赖，不做完整前后端联测。

## 2026-06-22 T-0038 日志上下文增强

- task: T-0038
- owner: frontend-agent
- scope: `/logs` 查询页在每条日志记录上提供“查看上下文”展开面板，展示目标日志前后的紧凑日志切片。
- status: frontend-ready

### 日志上下文 API 契约

- endpoint: `GET /api/v1/query/logs/{log_id}/context`
- auth: 沿用现有查询 API client，前端随请求携带 `Authorization: Bearer <access_token>`。
- request query:
  - `before`: number，可选，默认 5；前端会裁剪到 0 到 20。
  - `after`: number，可选，默认 5；前端会裁剪到 0 到 20。
- expected response body:

```json
{
  "target": {},
  "before": [],
  "after": []
}
```

- response fields:
  - `target`: 单条日志对象，字段沿用 `GET /api/v1/query/logs` 的日志 item 结构；若后端找不到或不返回目标日志，前端兼容 `null` 并显示目标缺失提示。
  - `before`: 日志对象数组，字段沿用 `GET /api/v1/query/logs` 的日志 item 结构。
  - `after`: 日志对象数组，字段沿用 `GET /api/v1/query/logs` 的日志 item 结构。
- frontend behavior:
  - `/logs` 列表每条日志提供“查看上下文”按钮，展开时才发起上下文请求。
  - 面板展示 Before、Target、After 三段；每段显示条数、日志级别、message 和基础元信息。
  - 支持加载中、错误、完全空响应，以及单段为空状态。
  - 用户可调整 `before`/`after`，范围 0 到 20；输入越界时前端裁剪后再请求。
  - 审计 P2 已修复：未登录、session 恢复中、登出或切换账号时，查询页不会继续渲染旧 session 缓存的结果列表、分页或日志上下文；查询缓存按认证会话版本隔离，并在登录/登出边界清理 `query` 根缓存。
  - 不新增图表库，不改变 `/metrics` 或 `/events` 查询行为。

## 2026-06-22 T-0037 Metrics 查询页当前页趋势图

- task: T-0037
- owner: frontend-agent
- scope: `/metrics` 查询页在当前页指标结果上展示 value 随 received_at 变化的轻量趋势图；`/logs`、`/events` 保持列表展示。
- status: frontend-ready

### API 契约影响

- 不新增后端接口、请求参数或响应 envelope。
- 继续使用既有 `GET /api/v1/query/metrics` 响应 item 字段：
  - `value`: number，用于趋势图纵轴。
  - `received_at`: string，用于当前页内按接收时间升序排序和横轴位置。
  - `name`、`unit`：用于判断当前页是否属于同一指标序列，并用于趋势点标题和数值展示。
- frontend behavior:
  - 仅对当前页 `items` 绘制趋势；翻到下一页后用下一页 `items` 重绘。
  - 当前页所有 metrics 必须具有相同 `name` 和 `unit` 才绘制单条趋势线；混合多个指标名或单位时显示趋势不可用提示，不影响列表展示。
  - 无有效 `value` 或 `received_at` 时显示当前页趋势不可用提示，不影响列表展示。
  - 当前小步不要求后端提供聚合窗口、多序列、跨页连续趋势或降采样数据。

## 2026-06-22 T-0035 查询页游标分页前端对齐

- task: T-0035
- owner: frontend-agent
- scope: `/metrics`、`/logs`、`/events` 查询页最小分页体验，配合后端 T-0034 查询 API 游标分页。
- status: frontend-ready

### 查询 API 分页契约

- affected endpoints:
  - `GET /api/v1/query/metrics`
  - `GET /api/v1/query/logs`
  - `GET /api/v1/query/events`
- request query:
  - 保留现有 `project_id`、主筛选字段、`source`、`occurred_from`、`occurred_to` 和 `limit`。
  - 新增可选 `cursor`：字符串；首次查询不传，点击“下一页”时传入上一页响应的 `next_cursor`。
- response body:

```json
{
  "items": [],
  "next_cursor": null
}
```

- response fields:
  - `items`：当前页记录数组，元素字段沿用各查询接口原有 item 契约。
  - `next_cursor`：`string | null`；有值表示还可以继续下一页，`null` 表示当前筛选下没有更多结果。
- frontend behavior:
  - 首次进入页面或登录恢复完成后加载第一页。
  - 点击“下一页”使用当前响应的 `next_cursor` 发起下一页请求，并替换为下一页结果。
  - 提交新的筛选条件或点击刷新时清空旧 cursor，页码回到第一页。
  - 未登录或 session 恢复中时保持原行为：展示登录提示并暂停查询请求。
  - 前端 client 当前保留对旧裸数组响应的兼容兜底，转换为 `{ items, next_cursor: null }`，用于后端 T-0034 分支未落地前的本地联调；正式契约仍以 envelope 为准。

## 2026-06-20 T-0018-subpath-api-config 子路径部署与 API 前缀策略

- task: T-0018-subpath-api-config
- owner: frontend-agent
- scope: 前端静态资源 base、React Router basename、同源 API 代理前缀配置。
- status: frontend-ready

### 公开访问路径

- `VITE_PUBLIC_BASE_PATH` 同时驱动 Vite `base` 和 React Router `basename`。
- 默认值为 `/`。
- 部署到 `https://域名/xxx/` 时设置为 `/xxx/`；构建资源路径应为 `/xxx/assets/...`，浏览器直达 `/xxx/settings` 时路由按 `/xxx` basename 匹配。

### API 基础地址策略

- `VITE_API_BASE_URL` 优先级最高；适合本地后端端口、独立 API 域名或明确跨源部署，不在前端硬编码真实域名。
- `VITE_API_BASE_URL` 留空时，前端使用 `VITE_API_BASE_PATH` 作为同源 API 前缀。
- `VITE_API_BASE_PATH=/api` 时，前端现有业务请求 `/api/v1/projects` 发送到 `/api/v1/projects`。
- `VITE_API_BASE_PATH=/xxx/api` 时，前端现有业务请求 `/api/v1/projects` 发送到 `/xxx/api/v1/projects`，健康检查 `/health` 发送到 `/xxx/api/health`。
- Nginx 或同源代理需要把 `/api` 或 `/xxx/api` 作为公网代理入口，并让后端收到与契约一致的实际路径，例如业务接口保持 `/api/v1/...`，健康检查保持 `/health`；否则前后端路径会不一致。

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
