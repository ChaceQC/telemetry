# 遥测前端

遥测前端使用 React、TypeScript、Vite 和 npm 构建。当前阶段提供可运行的控制台骨架、基础导航、总览页摄入统计、登录页、Settings 基础管理页面、Dashboard CRUD 基础页面、告警规则 CRUD 基础页面、Metrics/Logs/Traces/Events 查询页、Trace 服务拓扑基础展示、健康检查/API client 和环境变量示例。

## 环境要求

- 使用 Node.js `24.13.0` LTS，`.node-version` 与 `package.json` 的 `engines.node` 均固定为 `24.13.0`；npm 使用 `11.x`。
- 使用 npm 管理依赖，提交 `package-lock.json`。
- Windows PowerShell 中建议使用 `npm.cmd`。

## 本地启动

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

开发服务默认监听 `25173`：

```text
http://localhost:25173
```

预览构建产物默认监听 `25174`：

```powershell
npm.cmd run build
npm.cmd run preview
```

## 环境变量

复制 `.env.example` 为本地 `.env.local` 后按需调整。不要提交真实 `.env*` 文件。

```text
VITE_APP_NAME=遥测平台
VITE_APP_VERSION=0.2.12
VITE_PUBLIC_BASE_PATH=/
VITE_API_BASE_URL=http://localhost:28117
VITE_API_BASE_PATH=/api
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=25173
VITE_PREVIEW_HOST=127.0.0.1
VITE_PREVIEW_PORT=25174
```

`VITE_PUBLIC_BASE_PATH` 用于 Vite 构建资源路径和 React Router `basename`，默认 `/`；部署到 `https://域名/xxx/` 时设置为 `/xxx/`，则资源路径会构建为 `/xxx/assets/...`，浏览器访问 `/xxx/settings` 时路由也会按 `/xxx` 匹配。
`VITE_API_BASE_URL` 用于显式 API 基础地址，优先级最高，适合本地开发或 API 独立域名，例如 `http://localhost:28117`。若留空，则使用同源请求。
`VITE_API_BASE_PATH` 用于同源部署的 API 反向代理前缀，默认示例为 `/api`；子路径部署且 API 也挂在子路径下时可设置为 `/xxx/api`。前端会将现有业务请求 `/api/v1/projects` 归一化为 `/xxx/api/v1/projects`，不会硬编码真实域名。
生产 Nginx 需要与上述策略保持一致：`/api` 或 `/xxx/api` 作为公网代理入口时，转发到后端的实际路径仍应与后端契约一致，例如业务接口保持 `/api/v1/...`，健康检查保持 `/health`。
`VITE_DEV_HOST` 和 `VITE_PREVIEW_HOST` 默认使用 `127.0.0.1`，如需局域网调试可在本地环境变量中显式调整。

## 生产安全头与 CSP

生产环境的 CSP 和安全响应头应由 Debian 宿主机 Nginx 下发，不放入 `index.html` 的 meta CSP。原因是 Vite dev server、Vitest/jsdom 和当前 React 页面中的少量 inline style 需要更宽松的开发边界；把强 CSP 写死在 HTML 内容易破坏本地开发、预览和测试。生产 Nginx 可从以下保守基线开始：

```nginx
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; upgrade-insecure-requests" always;
add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "same-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header X-Frame-Options "DENY" always;
```

如果生产 API 与前端同源挂载在 `/api` 或 `/xxx/api`，`connect-src 'self'` 即可覆盖前端请求；如果 `VITE_API_BASE_URL` 指向独立 HTTPS 域名，需要把该 API origin 显式加入 `connect-src`。`Strict-Transport-Security` 只应在真实 HTTPS 域名证书和回滚策略确认后启用，不用于本地 HTTP 开发入口。后续若引入外部图片、字体、脚本、WebSocket 或 worker，应先更新 CSP 白名单并做浏览器验证。

## 登录与认证状态

`/login` 页面提供账号密码登录入口，当前按保守契约调用：

- `POST /api/v1/auth/login`：提交 `username` 和 `password`，预期返回 `access_token`、可选 `token_type`、`expires_in` 和 `user`。
- `GET /api/v1/auth/me`：携带 `Authorization: Bearer <token>` 读取当前用户。

登录成功后，API client 会为后续请求注入 `Authorization` 头；控制台侧栏显示当前账号和退出入口。会话恢复或刷新当前用户时，前端仅在 `/me` 返回 `401` 时清理本地 session；`403`、`503`、网络错误或超时会保留 token，并在认证状态区展示可恢复错误。普通表单/API 的 `401` 使用登录过期类文案，登录页单独展示账号或密码错误。

临时安全边界：当前会话使用 `sessionStorage` 保存 access token、token type 和非敏感用户展示信息，仅用于本地会话恢复。`sessionStorage` 仍可被同源 XSS 读取；CSP 和安全响应头只能降低注入和外联风险，不能把 `sessionStorage` 变成安全的生产 token 容器。生产最终方案应优先评估 HttpOnly、Secure、SameSite Cookie、后端托管 refresh token、短 access token 过期时间和服务端会话撤销能力。前端不要把密码、token、cookie、API key 或真实 `.env` 写入日志、URL 或文档示例。

## Settings 基础管理页面

`/settings` 页面提供阶段 1 的项目、环境、服务基础管理骨架：

- 项目：调用 `GET /api/v1/projects` 和 `POST /api/v1/projects`，创建字段使用后端契约的 `name`、`key`、`description`。
- 环境：调用 `GET /api/v1/environments` 和 `POST /api/v1/environments`，创建时必须选择 `project_id`，标识字段使用 `key`。
- 服务：调用 `GET /api/v1/services` 和 `POST /api/v1/services`，创建时必须选择 `project_id` 和 `environment_id`；环境下拉会按当前项目过滤，切换项目时会清空不匹配的环境。

列表响应兼容后端当前直接数组返回，也兼容 `{ items }`、`{ data }`、`{ results }` 包装。

Settings 管理接口使用当前 session token 访问。登录成功或从会话恢复到 token 后，请求会携带 `Authorization: Bearer <token>`；没有 token 或 session 仍在确认时，页面会显示登录提示并暂停列表刷新和创建提交。本轮没有增加全站路由守卫，其他控制台页面仍可按原路径访问。

错误展示不要求后端服务已启动即可验证：API client 兼容 FastAPI `detail` 为字符串、校验错误数组或对象；`/settings` 列表读取错误按页面级展示，创建表单对 `404`、`409`、`422` 使用表单级提示并保留后端返回的具体原因。Settings 列表或创建请求返回 `401` 时统一展示页面级登录过期提示和登录入口，不复用登录表单的账号密码错误文案。

## Dashboard CRUD 页面

`/dashboards` 页面提供阶段 5 的 dashboard 元数据管理基础，使用当前 session token 访问 Dashboard CRUD 后端接口：

- 列表：调用 `GET /api/v1/dashboards`，支持可选 `project_id`、固定首屏 `limit=50` 和 `offset=0`；页面同时复用 `GET /api/v1/projects` 展示项目下拉，也允许手动输入项目 ID。
- 创建：调用 `POST /api/v1/dashboards`，提交 `project_id`、`name`、可空 `description`、`layout` 和 `config`。
- 内置模板：调用 `GET /api/v1/dashboard-templates`、`GET /api/v1/dashboard-templates/{template_id}` 和 `POST /api/v1/projects/{project_id}/dashboard-templates/{template_id}/dashboards`；页面展示模板 panel/变量/time range 摘要，允许选择目标项目并填写可选名称/描述覆盖值。
- JSON 导出：调用 `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/export`，只导出 portable JSON 文档中的 `schema`、`version`、`name`、`description`、`layout` 和 `config`。
- JSON 导入：调用 `POST /api/v1/projects/{project_id}/dashboards/import`，本地先校验导入文档 `schema=telemetry.dashboard`、`version=1`、必填字段、禁止实例字段、JSON 大小/深度/复杂度和 `config.panels/time_range/variables` 最小 schema；允许填写可选名称/描述覆盖值，成功后进入普通 dashboard 编辑态。
- 编辑：调用 `PATCH /api/v1/projects/{project_id}/dashboards/{dashboard_id}`，只提交实际变化字段；描述清空会提交 `description=null`。
- 删除：调用 `DELETE /api/v1/projects/{project_id}/dashboards/{dashboard_id}`，成功后刷新 dashboard 列表。

从模板创建和 JSON 导入时，前端只发送 `name` 和 `description` 覆盖字段，不发送 `project_id`、`layout` 或 `config` 覆盖；创建成功后返回普通 dashboard，并进入既有编辑/预览工作流。`layout` 和 `config` 在前端以 JSON textarea 编辑，提交前会先校验必须是 JSON 对象或数组；`config.panels` 若存在会按后端最小 schema 校验并规范化。编辑区提供最小 panel 列表和添加/编辑/删除表单，字段包含 `id`、`title`、`type`、`query` JSON 和 layout `x/y/w/h`；操作会写回 `config.panels` 并保留其他顶层 legacy config 字段，最终仍通过既有 Dashboard update API 保存。编辑区同时提供只读 Panel 预览，直接消费当前 `config JSON` textarea 文本，展示 panel 标题、type/id、layout `x/y/w/h` 和稳定 query 摘要，并覆盖 legacy config、空 panels、invalid `config.panels`、未登录和未选择 dashboard 状态；预览不会触发保存 API 或图表数据请求。若选择 panel 后手动改动 `config JSON` 导致当前 index 不再指向原 panel id，更新会提示重新选择，避免覆盖错误 panel。页面展示 loading、error、empty、未登录/会话恢复、模板和导入导出 `401/404/422` 状态；Dashboard 查询缓存按 `sessionRevision` 隔离，登录、登出和切换账号会清理 `dashboards` 缓存，避免显示上一 session 数据。当前不做分享/只读、模板市场、复杂模板编辑、批量导入、覆盖导入、文件上传存储、ClickHouse 图表查询或告警规则。

## 告警规则 CRUD 页面

`/alerts` 页面提供阶段 6 的告警规则管理基础，使用当前 session token 访问 API-0025：

- 列表：调用 `GET /api/v1/alerts/rules`，支持可选 `project_id`、`severity`、`signal`、`enabled`、固定 `limit=50` 和 `offset` 分页；页面复用 `GET /api/v1/projects` 展示项目下拉，也允许手动输入项目 ID。
- 创建：调用 `POST /api/v1/alerts/rules`，提交 `project_id`、`name`、可空 `description`、`enabled`、`severity`、`signal`、`condition` 和 `evaluation`。
- 编辑：调用 `PATCH /api/v1/projects/{project_id}/alerts/rules/{rule_id}`，只提交实际变化字段；描述清空会提交 `description=null`。
- 启停：列表和编辑区的启停操作只 PATCH `{ "enabled": true|false }`。
- 删除：调用 `DELETE /api/v1/projects/{project_id}/alerts/rules/{rule_id}`，删除前使用确认提示。

本地校验对齐后端契约：`name` 1 到 100 字符，`description` 最多 500 字符；`severity=info/warning/critical`；`signal=metrics/logs/traces/events`；`condition` 和 `evaluation` 必须是非空 JSON 对象，拒绝非法 JSON、数组、空对象、超大/过深/过复杂 JSON 和 `NaN`/`Infinity`；`evaluation.window_seconds` 与 `evaluation.interval_seconds` 必须是 `1..86400` 的整数。页面覆盖未登录、会话恢复、loading、error、empty、筛选、分页、创建、编辑、启停、删除确认、`401/403/404/409/422` 错误提示，并展示创建/更新时间与用户 ID。告警规则查询缓存按 `sessionRevision` 隔离，登录、登出和切换账号会清理 `alerts/rules` 缓存。当前不做规则评估调度、通知渠道、告警历史、静默/恢复、Webhook、真实后端联测或 ClickHouse/MongoDB/Redis 后台链路。

## 总览页摄入统计

`/` 总览页会在登录后调用 `GET /api/v1/ingest/stats?limit=100`，按当前账号可访问项目汇总 metrics、logs 和 events 的 `accepted_count`、`rejected_count`、`bytes_count`、来源数量和最近统计时间。

未登录或会话恢复中时，总览页暂停摄入统计请求并显示登录提示；健康检查仍独立调用 `GET /health`。当前总览只做轻量汇总，不提供项目筛选、时间序列趋势、trace 统计或真实图表。

## 查询页基础

`/metrics`、`/logs`、`/traces` 和 `/events` 页面已替换为查询工作台，使用当前 session token 访问查询接口：

- `/metrics`：调用 `GET /api/v1/query/metrics`，支持项目 ID、指标名、来源、时间范围、数量和 `cursor` 筛选，并在当前页结果属于同一 `name`/`unit` 序列时展示 value 随 received_at 变化的轻量趋势图。
- `/logs`：调用 `GET /api/v1/query/logs`，支持项目 ID、日志级别、关键词、Trace ID、Span ID、Request ID、User ID、来源、时间范围、数量和 `cursor` 筛选；访问 `/logs?trace_id=...&span_id=...` 时会用 URL 初始化 Trace ID / Span ID 筛选并查询或显示已应用筛选；每条日志可展开“查看上下文”，调用 `GET /api/v1/query/logs/{log_id}/context?before=5&after=5` 展示目标日志前后记录，`before`/`after` 可在 0 到 20 内调整。
- `/traces`：调用 `GET /api/v1/query/traces`，支持项目 ID、Trace ID、Span ID、Span 名称、来源、时间范围、数量和 `cursor` 筛选；当前页结果按 `trace_id` 分组，组内按 `parent_span_id` 显示树形缩进和 waterfall 耗时条，孤儿 span 会作为稳定根节点展示；trace 组和 span 行提供“查看相关日志”入口，使用相对路由跳转到 `/logs` 并携带 `trace_id` 和可选 `span_id`；页面头部提供“服务拓扑”入口跳转到 `/traces/topology`；错误 span、慢 span 和缺失时间数据会以克制标识提示，每条 span 仍可展开查看 trace_id、span_id、parent_span_id、name、source、status、duration、start/end/occurred/received 时间、attributes 和 payload。
- `/traces/topology`：调用 `GET /api/v1/query/traces/topology`，项目 ID 必填，支持来源、时间范围和数量筛选；结果区以轻量节点/调用边摘要展示 `source`、`span_count`、`trace_count`、`error_span_count`、平均/最大 duration，以及 `from_source`、`to_source`、`call_count`、`error_count`、平均/最大 duration。本页不做复杂图布局、拖拽或画布渲染，不返回 cursor，不透传 Trace ID、Span ID、Span 名称或日志专属参数。
- `/events`：调用 `GET /api/v1/query/events`，支持项目 ID、事件类型、来源、时间范围、数量和 `cursor` 筛选；结果区按当前页 API 返回顺序展示为事件时间线，包含事件类型、source、occurred/received 时间、项目 ID、事件 ID，以及 payload 摘要和可展开 JSON 预览。

查询响应按后端查询契约使用 envelope：`{"items": [...], "next_cursor": string | null}`。查询页首次加载第一页；点击“下一页”时使用上一页返回的 `next_cursor` 继续查询；点击“回第一页”、刷新或提交新的筛选条件时会清空旧 cursor 并回到第一页。日志关键词、Request ID 和 User ID 仅用于 `/logs` 请求；Trace ID 和 Span ID 用于 `/logs` 与 `/traces` 各自接口，不会透传给 metrics 或 events。URL 中的 `trace_id` / `span_id` 只初始化 `/logs` 或 `/traces` 对应页面筛选，不影响 `/metrics`、`/events` 或拓扑查询参数。

拓扑页响应按后端查询契约使用 `{"nodes": [...], "edges": [...]}`。`/traces/topology` 会从 URL 中读取 `project_id`、`source`、`occurred_from`、`occurred_to` 和 `limit` 初始化筛选，忽略 `trace_id`、`span_id`、日志关键词和其他页面专属参数；`/logs` 与 `/traces` 的 trace/span URL 初始化能力保持隔离，不影响 `/metrics`、`/events` 或拓扑请求。

未登录或会话恢复中时，查询页显示登录提示并暂停请求，同时不会继续渲染旧 session 缓存的结果列表、分页、日志上下文或拓扑摘要；登录、登出和切换账号会按认证会话隔离并清理 `query` 查询缓存。登录后可刷新或提交筛选条件重新查询。当前页面提供筛选表单、加载/错误/空态、刷新、回第一页、下一页、结果列表，`/metrics` 当前页指标趋势图，`/logs` 单条日志上下文面板，`/traces` trace 组展开/收起、树形 waterfall 和单条 span 详情展开，`/traces/topology` 服务节点/调用边摘要，以及 `/events` 当前页事件时间线；当前页混合多个指标名或单位时会显示趋势不可用提示。跨页趋势、事件详情跳转和事件跨页合并后续拆分。

## 目录结构

```text
src/
  app/          应用 Provider 和路由
  api/          API client、配置和接口封装
  components/   通用布局和展示组件
  features/     领域组件，当前包含 auth、settings、dashboards、alerts 和 query 相关能力
  pages/        页面入口
  styles/       全局样式
```

## 验证命令

前端使用 ESLint 作为静态代码质量检查，CI 会执行 `npm run lint`：

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Vitest 单元测试默认使用 Node 环境；Dashboard CRUD 和告警规则 CRUD 交互测试通过文件级 `jsdom` 环境和 Testing Library 覆盖创建、更新、删除和本地 JSON 校验。

当前首屏会调用 `GET /health`。后端未启动时页面会显示“待连接”状态，这是预期的可恢复错误态。
