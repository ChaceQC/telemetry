# 前端项目进度记录

本文件由前端开发 agent 维护。总 agent 会定时探测本文件，并将新增进展合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 2026-06-22 T-0039 日志关键词搜索基础前端

### 已完成

- 更新查询 API client：`LogQueryParams` 新增可选 `keyword`，`listLogs` 会把非空 keyword 编入 `GET /api/v1/query/logs` 查询参数；metrics/events client 保持白名单参数，不透传误传的 keyword。
- 更新 `/logs` 查询表单：新增“关键词”输入，沿用现有 signal scoped filter 状态；`/metrics` 与 `/events` 不显示关键词字段。
- 将查询筛选参数构建抽到 `frontend/src/features/query/queryFilters.ts`，提交筛选或刷新时继续以无 cursor 参数回到第一页，下一页请求携带当前筛选和 `next_cursor`。
- 更新 `frontend/src/styles/global.css`，让查询表单在 logs 多一个筛选字段时按现有样式自适应排列。
- 更新 `frontend/README.md` 与 `agents/runtime/api-contracts/frontend-requests.md`，记录 T-0039 keyword 请求参数、只影响 logs 的边界和分页行为。

### 阻塞与风险

- 本轮不做完整前后端联测，不启动真实后端、dev server 或浏览器。
- 页面交互层当前没有 jsdom/testing-library 基础；关键词填写后的参数和 cursor 重置通过筛选构建单元测试与 API URL 测试覆盖。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/api/query.test.ts src/features/query/queryFilters.test.ts src/pages/QueryPage.test.tsx` 通过（3 个测试文件、12 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（12 个测试文件、52 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已执行 `git diff --check` 通过。

## 2026-06-22 T-0038 审计 P2 日志上下文会话隔离修复

### 已完成

- 修复查询页登出、session 恢复中或无查询权限时仍可能渲染旧 React Query 缓存的问题：`/metrics`、`/logs`、`/events` 结果列表、分页和错误态现在都先经过 `canQuery` 可见性门禁。
- 修复 `/logs` 已展开上下文面板在登出后继续显示旧 context 的问题：上下文面板必须同时满足已展开且当前可查询才会挂载，context 数据也经过相同可见性门禁。
- 新增非敏感 `sessionRevision`，登录和登出时递增，并将其纳入查询页与日志上下文 query key；同时在登录/登出边界取消并移除 `['query']` 根缓存，降低 30 秒 staleTime 下快速切换账号复用旧数据的风险。
- 登录成功时立即注入新的 API token，登出时立即清理内存 token，减少认证状态切换时序窗口。
- 新增 `frontend/src/features/query/querySession.ts` 统一查询根 key、会话维度 key、可见性门禁和缓存清理；新增页面级 SSR 测试覆盖旧 logs/context 缓存在未登录状态不会继续渲染。
- 更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，记录 T-0038 审计 P2 已修和查询缓存会话隔离行为。

### 阻塞与风险

- 本轮不启动真实后端、数据库、dev server 或浏览器，不做完整前后端联测。
- 当前修复聚焦查询页与日志上下文的旧缓存可见性；Settings、Overview 等其他页面仍按各自既有认证门禁处理。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/pages/QueryPage.test.tsx src/features/query/querySession.test.ts src/api/query.test.ts` 通过（3 个测试文件、10 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（11 个测试文件、46 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已执行 `git diff --check` 通过。

## 2026-06-22 T-0038 日志上下文增强前端

### 已完成

- 新增 `frontend/src/api/query.ts` 日志上下文 API client：`GET /api/v1/query/logs/{log_id}/context`，沿用现有 Bearer 鉴权；`before`、`after` 默认 5，并在前端裁剪到 0 到 20。
- 更新 `/logs` 查询列表：每条日志提供“查看上下文”展开面板，按 Before、Target、After 三段紧凑展示日志 message、级别和基础元信息。
- 上下文面板提供 loading、error、完全空响应、单段为空、刷新，以及 before/after 数量调整状态；不影响 `/metrics` 和 `/events` 当前查询工作流。
- 更新 `frontend/src/styles/global.css`，补充日志上下文面板、输入控件、三段列表、target 轻量强调和窄屏布局。
- 更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，记录 T-0038 请求契约和前端行为边界。

### 进行中

- 实现、文档和开发侧自检已完成；准备一次聚合提交并推送 `feature/frontend-dev`。

### 阻塞与风险

- 本轮不启动真实后端、数据库或完整前后端联合测试；日志上下文的真实排序、项目权限和缺失目标日志场景由后续测试 agent 结合真实后端补验。
- 当前上下文展示只覆盖目标日志附近切片，不提供跨页合并、上下文内全文筛选、导出或 trace/span 关联跳转。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/api/query.test.ts` 通过（1 个测试文件、5 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（9 个测试文件、41 个测试通过）。
- 已执行 `git diff --check` 通过。
- 已启动本地前端 dev server 做最小 HTTP 自测：命令 `npm.cmd run dev -- --host 127.0.0.1 --port 25173`，监听进程 PID `37224`，`Invoke-WebRequest http://127.0.0.1:25173/logs` 返回 200；自测后已停止 PID `37224`，确认 `25173` 端口释放。
- 曾尝试用本地 Node 脚本加载 Playwright 做浏览器检查，但项目未安装 `playwright` 包，脚本因 `Cannot find module 'playwright'` 失败；未进行完整浏览器 E2E 或真实后端联调。

## 2026-06-22 版本同步

### 已完成

- 随阶段 3 查询与展示 MVP 当前进度，将 `frontend/VERSION`、`frontend/package.json`、`frontend/package-lock.json`、`frontend/.env.example` 和 `frontend/src/api/config.ts` 的前端版本同步到 `0.2.0`。
- 更新 `frontend/README.md` 中的环境变量示例版本。

## 2026-06-22 T-0038 后版本同步

### 已完成

- 随日志上下文查看前端能力合入 `dev`，将 `frontend/VERSION`、`frontend/package.json`、`frontend/package-lock.json`、`frontend/.env.example`、`frontend/src/api/config.ts` 和 `frontend/README.md` 的前端版本同步到 `0.2.1`。
- 本次版本提升原因：新增 `/logs` 上下文查看交互，并修复登出/切换会话后旧查询缓存可见风险。

### 阻塞与风险

- 本轮仅做版本声明同步，不修改前端业务交互。
- 运行中的真实联测 agent 如启动了前端服务，应由该 agent 自行清理自己的进程；本次版本同步不关闭任何进程。

### 下一步

- 等待总 agent 完成根仓库验证、提交、推送和 GitHub Actions 复查。

## 2026-06-22 T-0037 趋势图审计 P2 修复

### 已完成

- 修复 `frontend/src/features/metrics/metricTrend.ts`，趋势模型生成前校验当前页 metrics 是否属于同一 `name` 和 `unit` 序列；不同指标或不同单位时返回不可用状态，不再生成单条折线路径。
- 更新 `frontend/src/pages/QueryPage.tsx`，metrics 当前页混合多个指标或单位时显示“当前页包含多个指标或单位，趋势图暂不可用。”用户提示；同一指标/单位仍正常展示当前页趋势。
- 扩展 `frontend/src/features/metrics/metricTrend.test.ts`，覆盖同 `name`/`unit` 可绘制、不同 `name` 不绘制、不同 `unit` 不绘制，以及无可绘制点兜底。
- 更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，同步记录 `/metrics` 当前页趋势图需要同一 `name`/`unit` 序列。

### 进行中

- 实现、开发侧自检和测试 agent 独立复验已完成；准备提交并推送 `feature/frontend-dev`。

### 阻塞与风险

- 本次只阻止混合 `name`/`unit` 的当前页单线趋势；标签组合、多序列对比、跨页连续趋势和聚合窗口仍留给后续任务。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/features/metrics/metricTrend.test.ts` 通过（1 个测试文件、6 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已执行 `git diff --check` 通过。
- 测试 agent Singer 已独立复验：`git diff --check`、`npm.cmd test -- metricTrend`、`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test` 均通过；全量 Vitest 为 9 个测试文件、39 个测试通过。Singer 未跑后端测试、浏览器矩阵或真实页面截图；PowerShell 拦截 `npm.ps1` 后已改用 `npm.cmd`。

## 2026-06-22 T-0037 查询页指标趋势图基础

### 已完成

- 新增 `frontend/src/features/metrics/metricTrend.ts`，按当前页 metrics item 的 `received_at` 升序生成轻量 SVG 趋势点、折线路径、面积路径和最小/最大值。
- 新增 `frontend/src/features/metrics/metricTrend.test.ts`，覆盖 received_at 排序、相同 value/received_at 稳定坐标，以及无效 value/received_at 兜底。
- 更新 `frontend/src/pages/QueryPage.tsx`，仅在 `/metrics` 当前页有结果时展示 value 随 received_at 变化的趋势图；`/logs` 和 `/events` 保持列表展示。
- 更新 `frontend/src/styles/global.css`，补充趋势图容器、SVG 折线、点位、统计和移动端布局，固定图表高度并避免窄屏溢出。
- 更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，记录 T-0037 不新增后端接口，仅使用现有 metrics 查询字段 `value`、`received_at`、`name` 和 `unit`。

### 进行中

- 实现、开发侧自检和测试 agent 独立复验已完成；准备提交并推送 `feature/frontend-dev`。

### 阻塞与风险

- 当前趋势图只覆盖当前页 `items`，翻页后按下一页重绘；不提供跨页连续趋势、指标聚合窗口、多序列对比、降采样或异常点标记。
- 本小步不启动真实后端/数据库，不做真实登录联调。
- 测试 agent 浏览器冒烟已打开 `/metrics`，但 mock 数据注入因 Playwright CLI 在 PowerShell 下 JSON 引号处理异常而未完成有数据 SVG 可视确认；保留“有数据时趋势图真实渲染”的轻量视觉风险。

### 下一步

- 提交并推送后等待总 agent 安排审计和集成；后续查询展示增强可拆分指标聚合窗口、多序列对比或日志/事件详情体验。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/features/metrics/metricTrend.test.ts` 通过（1 个测试文件、3 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/api/query.test.ts` 通过（1 个测试文件、3 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run test -- src/features/metrics/metricTrend.test.ts src/api/query.test.ts` 通过（2 个测试文件、6 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已执行 `git diff --check` 通过。
- 测试 agent Raman 已独立复验：`npm.cmd --prefix frontend run lint`、`npm.cmd --prefix frontend run test`、`npm.cmd --prefix frontend run typecheck`、`npm.cmd --prefix frontend run build`、`git diff --check` 均通过；全量 Vitest 为 9 个测试文件、36 个测试通过。
- Raman 启动过前端 dev server `127.0.0.1:25173` 并用 Playwright + Edge 打开 `/metrics`，未启动真实后端/数据库；复验后已关闭 Playwright session、停止 Vite PID `52604`、清理 `.playwright-cli/` 临时目录，最终确认 `25173` 无监听。

## 2026-06-22 T-0035 查询页分页基础

### 已完成

- 更新 `frontend/src/api/query.ts`，为 metrics、logs、events 查询参数新增可选 `cursor`，并将查询返回类型调整为 `{ items, next_cursor }` envelope。
- 查询 API client 保留旧裸数组响应兼容兜底，转换为 `{ items, next_cursor: null }`，便于后端 T-0034 分支未落地前本地联调；正式契约仍以 envelope 为准。
- 更新 `frontend/src/pages/QueryPage.tsx`，支持首次加载第一页、点击“下一页”使用 `next_cursor` 继续查询，提交筛选条件或刷新时清空旧 cursor 并回到第一页；未登录和 session 恢复中仍暂停查询并显示登录提示。
- 更新查询页分页脚注和按钮样式，窄屏下分页提示和按钮纵向排列，避免长文本挤压。
- 更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，记录 T-0035/T-0034 查询分页契约、前端行为和剩余边界。
- T-0035 前端实现已提交 `5b498875`；测试记录已提交 `7707b49`。
- 测试 agent Helmholtz 已用真实 MySQL 8.0.42 临时库、真实后端 `28117`、真实前端 `25173` 完成 T-0034/T-0035 联合测试；登录、项目/API Key 创建、metrics/logs/events 各 3 条上报、HTTP 分页、浏览器 `/metrics` `/logs` `/events` 下一页/刷新/空态均通过。

### 进行中

- 暂无进行中的 T-0035 前端联调事项；等待总 agent 按业务路径安排后续集成与审计流转。

### 阻塞与风险

- 当前只提供最小向前分页，不提供上一页、页码缓存、追加加载、导出或分页历史回退；这些能力后续按查询页体验拆分。
- 临时库已 drop，`25173`、`25174`、`28117` 已释放。
- 当前未覆盖 Docker Compose MySQL、大数据量、并发分页、生产反代/子路径部署。

### 下一步

- 由总 agent 按业务路径推进 T-0034/T-0035 后续集成；Docker Compose MySQL、大数据量、并发分页、生产反代/子路径部署留待对应集成或部署任务补验。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test -- query.test.ts` 通过（1 个测试文件、3 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（9 个测试文件、35 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已执行 `git diff --check` 通过。
- 本轮未启动 Vite dev server 或 preview server；已额外确认 `25173` 无监听进程。
- 测试 agent Nietzsche 已完成只读复验：`npm.cmd run lint`、`npm.cmd run test`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check` 均通过，并复核 `25173` 无监听；未做浏览器/E2E 或真实后端游标分页联调。
- 测试 agent Helmholtz 已完成 T-0034/T-0035 真实联合测试并通过；测试记录提交为 `7707b49`。

## 2026-06-21 T-0033 总览页摄入统计接入

### 已完成

- 新增 `frontend/src/api/ingestStats.ts`，封装 `GET /api/v1/ingest/stats`，沿用现有 API base URL 与 session Bearer token 行为。
- 新增 `frontend/src/api/queryParams.ts`，将查询参数拼接逻辑从 `query.ts` 抽出复用，避免统计和查询 client 重复实现。
- 新增 `frontend/src/features/overview/ingestStatsSummary.ts`，按 metrics、logs、events 汇总 accepted、rejected、bytes、来源数量和最近统计时间。
- 更新 `frontend/src/pages/OverviewPage.tsx`，将静态信号占位改为摄入统计驱动；未登录或会话恢复中时暂停统计请求并显示登录提示，健康检查仍独立刷新。
- 更新总览页样式和 `frontend/README.md`，补充统计列表、可点击信号卡、移动端布局和当前边界。

### 进行中

- 等待总 agent 按业务路径将前端分支提交集成回 `dev`，并读取 GitHub Actions 结果。

### 阻塞与风险

- 本小步未启动真实后端和真实登录账号联调；当前通过 API client 单测、汇总纯函数测试和未登录态浏览器冒烟覆盖主要前端行为。
- 摄入统计 API 当前按 bucket/project/API key/kind/source 返回聚合行；总览页只做最近 100 行轻量汇总，项目筛选、时间序列趋势、trace 统计和图表后续拆分。

### 下一步

- 由总 agent 在根工作树按路径集成 T-0033，并在 CI 通过后继续阶段 3 查询展示增强：优先补真实登录联调、基础图表或查询结果分页。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test -- ingestStats.test.ts ingestStatsSummary.test.ts query.test.ts` 通过（3 个测试文件、6 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（9 个测试文件、34 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已执行 `git diff --check` 通过。
- 已用 Playwright CLI + Microsoft Edge 检查 `http://127.0.0.1:25173/` 桌面宽度和 390px 移动宽度；未登录态下总览页正常显示统计登录提示、信号摘要卡、健康检查错误态和近期进展，未发现明显文本重叠或布局溢出。验收后已关闭浏览器会话和 Vite dev server，`25173` 无监听进程。

## 2026-06-21 T-0032 查询页前端基础

### 已完成

- 新增 `frontend/src/api/query.ts`，封装 `GET /api/v1/query/metrics`、`GET /api/v1/query/logs` 和 `GET /api/v1/query/events`，查询请求沿用现有 API base URL 与 session Bearer token 行为。
- 新增 `frontend/src/pages/QueryPage.tsx`，将指标、日志和事件查询统一为可复用工作台，支持项目 ID、主筛选字段、来源、时间范围、数量、刷新、未登录提示、错误态、空态和结果列表。
- 将 `/metrics`、`/logs`、`/events` 路由从占位页替换为查询页，并补充查询表单、结果列表和 JSON 预览样式。
- 新增 `frontend/src/api/query.test.ts`，覆盖查询参数拼接、空筛选跳过和认证头携带。
- 更新 `frontend/README.md`，记录查询页入口、接口、认证行为和后续拆分边界。

### 进行中

- 等待总 agent 按业务路径将前端分支提交集成回 `dev`，并读取 GitHub Actions 结果。

### 阻塞与风险

- 本小步不启动真实后端和真实登录账号联调；浏览器验收覆盖未登录态、路由替换和响应式布局，登录后查询成功/空态/错误态仍需后续结合真实后端补验。
- 当前先展示基础列表和 JSON 预览，不包含指标图表、日志上下文、事件时间线细节、指标聚合窗口、多序列对比或游标分页。
- Playwright 冒烟期间发现开发态 `favicon.ico` 返回 `404`，属于既有静态资源缺口，不阻塞本查询页小步。

### 下一步

- 由总 agent 在根工作树按路径集成 T-0032，并在 CI 通过后继续阶段 3 查询展示增强：优先补登录后真实查询联调、基础图表或查询结果分页。

### 验证

- 已在 `frontend/` 包目录执行：`npm.cmd run test -- query.test.ts` 通过（2 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run typecheck` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过。
- 已在 `frontend/` 包目录执行：`npm.cmd run test` 通过（7 个测试文件、30 个测试通过）。
- 已在 `frontend/` 包目录执行：`npm.cmd run build` 通过。
- 已用 Playwright CLI + Microsoft Edge 检查 `http://127.0.0.1:25173/metrics`、`/logs`、`/events` 桌面宽度，以及 `/metrics` 390px 移动宽度；页面正常渲染，未发现明显文本重叠或布局溢出。验收后已关闭浏览器会话和 Vite dev server，`25173` 无监听进程。

## 2026-06-20

### 已完成

- `T-0018-subpath-api-config`：新增 `VITE_PUBLIC_BASE_PATH`，Vite `base` 与 React Router `basename` 共用该配置；默认 `/`，支持 `/xxx/` 子路径部署，避免生产资源仍指向 `/assets/...` 或 `/xxx/settings` 不匹配。
- `T-0018-subpath-api-config`：新增 API 基础路径归一化工具；`VITE_API_BASE_URL` 显式配置优先，留空时使用 `VITE_API_BASE_PATH` 作为同源 API 挂载点，支持 `/api` 和 `/xxx/api`，并避免把现有 `/api/v1/...` 请求拼成 `/api/api/v1/...`。
- `T-0018-subpath-api-config`：补充 base path/API URL 纯函数测试和 API client 同源子路径测试，覆盖 Vite base 格式、Router basename、显式 API URL 优先级、同源 API 前缀和请求路径拼接。
- `T-0018-subpath-api-config`：更新 `.env.example`、`frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，明确子路径部署、`/api` vs `/xxx/api` 同源代理策略，以及不硬编码真实域名的约束。
- `T-0015-authenticated-settings-client`：Settings/基础管理页面接入认证状态；有 session 且恢复完成后才请求项目、环境、服务管理接口，刷新和创建入口会随认证状态禁用。
- `T-0015-authenticated-settings-client`：登录或恢复 session 后，API client 会在 Settings 管理请求中携带 `Authorization: Bearer <token>`；登录成功路径同步注入内存 token，避免首个请求空 token。
- `T-0015-authenticated-settings-client`：Settings 列表读取或创建请求返回 `401` 时统一显示页面级登录提示和登录入口；普通管理表单不再把 `401` 展示为账号密码错误，`404`、`409`、`422` 仍保留表单级业务错误。
- `T-0015-authenticated-settings-client`：补充 Settings API token header 与无 token 行为测试，并新增 Settings 认证状态纯函数测试，覆盖未登录、恢复中、ready 和 `401` 页面级提示。
- `T-0015-authenticated-settings-client`：更新 `agents/runtime/api-contracts/frontend-requests.md`、`frontend/README.md`，记录 Settings 管理接口认证头、未登录暂停请求和 `401` 页面级处理。
- `T-0013-fix`：修复认证恢复/刷新错误处理，`/me` 仅在 `401` 时清理 session；`403`、`503`、网络错误和超时会保留本地 token，并通过认证状态展示可恢复错误。
- `T-0013-fix`：拆分登录页与普通 form/API 的 `401` 展示文案；登录页保留“账号或密码不正确”，普通表单改为登录过期/未登录类提示，避免 Settings 后续接入认证时误导。
- `T-0013-fix`：将登录页可见文案改为用户面向的登录状态和安全提示，移除“阶段 1”“后端契约稳定后”等实现路线说明。
- `T-0013-fix`：补充 http/auth 错误处理测试，覆盖登录专用 401、普通表单 401、网络错误中文提示，以及仅 401 清理 session 的判定逻辑。
- `T-0013-auth-ui-shell`：新增阶段 1 最小登录壳 `/login`，包含账号/密码表单、提交中状态、表单级错误展示和登录后回跳；当前未强制锁死整个 app。
- `T-0013-auth-ui-shell`：新增认证 API client/types，按保守契约调用 `POST /api/v1/auth/login` 和 `GET /api/v1/auth/me`；`apiRequest` 支持注入和清理 `Authorization` 头。
- `T-0013-auth-ui-shell`：新增前端认证状态 Provider，登录后将 token 注入 API client，控制台侧栏展示当前账号/恢复状态和退出入口。
- `T-0013-auth-ui-shell`：新增 auth client 单测，并扩展 http client 单测覆盖认证头注入/清理。
- `T-0013-auth-ui-shell`：更新 `agents/runtime/api-contracts/frontend-requests.md` 记录认证接口草案；按本任务约束未修改 `AGENT_COMMUNICATION.md`。
- `T-0013-auth-ui-shell`：更新 `frontend/README.md`，补充 `/login`、认证 API、认证状态和临时 token 存储安全边界。
- `T-0011-frontend-ci-lint-fix`：为前端补齐真实可用的 `npm run lint`，新增 ESLint flat config，接入 TypeScript、React Hooks、React Refresh 和 browser/node globals 检查，脚本使用 `eslint . --max-warnings=0`。
- `T-0011-frontend-ci-lint-fix`：新增 ESLint 相关 devDependencies，并同步 `package.json`、`package-lock.json`；更新 `frontend/README.md` 验证命令，明确 CI lint 对应的本地命令。
- `T-0009`：按协调要求先同步 `origin/dev` 日志规则修正，`.gitignore` 已加入 `agents/runtime/*.log.md`，并通过 `git rm --cached` 将本地运行日志移出 Git 跟踪；清理提交 `ff21e8f` 已推送到 `feature/frontend-dev`。
- `T-0009`：增强 API client 错误解析，FastAPI `detail` 为字符串、校验数组或对象时均可提取展示；Settings 列表错误使用页面级文案，创建表单对 `404`、`409`、`422` 使用表单级文案并保留后端返回的具体原因。
- `T-0009`：补充 Vitest 覆盖对象型 `detail`、页面级 404 和表单级 404/409/422 错误展示；请求字段继续保持后端 T-0006/T-0008 契约的 `key` 和服务必填 `environment_id`，未新增后端不存在字段。
- `T-0009`：更新 `frontend/README.md` 和 `agents/runtime/api-contracts/frontend-requests.md`，记录 Settings 错误展示和 FastAPI `detail` 支持范围。
- `T-0007-fix`：修复基础管理页面骨架审计未通过项；已读取后端 T-0006 契约并将 Settings API/types/forms 从 `slug` 对齐为 `key`。
- `T-0007-fix`：服务创建表单已要求必选 `environment_id`，环境下拉按当前 `project_id` 过滤，切换项目时会清空不属于新项目的环境选择。
- `T-0007-fix`：更新 `agents/runtime/api-contracts/frontend-requests.md`，标注项目、环境、服务 API 已与后端 T-0006 契约对齐，并记录服务 `environment_id` 必填。
- `T-0007-fix`：更新 `frontend/README.md`，补充 `/settings` 页面能力、后端接口和服务环境过滤行为。
- `T-0007-fix`：测试子 agent Faraday 已完成复验，`typecheck`、`test`、`build` 均通过，测试日志已写入 `agents/runtime/test-agent.log.md`。
- `T-0007`：完成阶段 1 Settings/基础管理最小页面骨架，包含项目、环境、服务三个资源的列表、创建表单、刷新、加载态、错误态、空状态和提交中状态。
- 新增 `frontend/src/api/settings.ts`，封装项目、环境、服务列表与创建 API client；列表响应兼容 `{ items }`、`{ data }`、`{ results }` 包装和直接数组。
- 新增 `frontend/src/features/settings/`，拆分基础管理面板、表单控件、项目/环境/服务资源面板和摘要组件；`/settings` 路由已切换为真实基础管理页面。
- 已先读取后端契约草案，当前仅有 `GET /health`；已在 `agents/runtime/api-contracts/frontend-requests.md` 追加项目、环境、服务列表与创建接口需求，避免硬猜后端实现。
- 修复前端审计 P3：`package.json` 和 `package-lock.json` 的 `engines.node` 精确固定为 `24.13.0`，README 与 `.node-version` 表述保持一致。
- 建立前端进度记录文件。
- 创建 `frontend/VERSION`，初始版本为 `0.1.0`。
- 启动前端开发 agent 处理 `T-0004`，并在 `AGENT_COMMUNICATION.md` 登记前端骨架任务边界。
- 创建 React + TypeScript + Vite + npm 前端项目骨架，包含 `package.json`、`package-lock.json`、Vite 配置、TypeScript 配置和 `src/` 目录。
- 实现基础控制台首屏、侧边栏导航、模块占位页、后端健康检查入口和错误态展示。
- 新增基础 API client，API 基础地址从 `VITE_API_BASE_URL` 读取。
- 新增 `frontend/.env.example` 和 `frontend/README.md`，记录开发端口 `25173`、预览端口 `25174` 和启动命令。
- 修复 `T-0004` 前端审计未通过项：`package.json` 的 `dev`/`preview` 不再写死 host 和端口，Vite 从环境变量读取开发/预览 host 与端口，默认本机回环监听并保留 `25173`/`25174`。
- 固定 Node.js `24.13.0` LTS，新增 `.node-version`，并在 `package.json` `engines` 中约束 Node 与 npm 版本。
- 改进 API client 错误消息解析，兼容 FastAPI 默认 `detail` 字符串、校验错误数组和嵌套错误消息。
- 新增 Vitest 测试，覆盖 API URL 拼接、FastAPI `detail` 错误解析和请求超时错误。
- 升级并锁定 Vitest `4.1.9`，同步 `package-lock.json`，`npm install` 结果为 0 个漏洞。
- 更新前端 README，补充 Node LTS、host 环境变量和测试命令说明。

### 进行中

- `T-0018-subpath-api-config`：实现、文档、验证和提交前检查已完成，待提交并推送 `feature/frontend-dev`。
- `T-0009` 业务改动已通过提交 `70a58c7` 推送到 `feature/frontend-dev`，当前处于审计中，待总 agent 汇总审计结论并安排后续集成。

### 阻塞与风险

- 暂无阻塞。
- `T-0018-subpath-api-config` 本轮不修改后端或 Nginx；生产部署需由总 agent/部署任务确认 Nginx 对 `/api` 或 `/xxx/api` 的公网代理入口转发后，后端仍收到与契约一致的 `/api/v1/...` 和 `/health` 等实际路径。
- `T-0018-subpath-api-config` 本轮不启动真实后端、不做浏览器直达 `/xxx/settings` 的 E2E；当前验证覆盖构建、类型、单测和静态检查，真实子路径部署仍需部署环境补验。
- `T-0015-authenticated-settings-client` 本轮未启动真实后端做浏览器联调；Settings `401`/`403`/成功写入仍需等后端认证与管理接口同时可用后补真实联调。
- `T-0013-auth-ui-shell` 后端认证契约尚未最终集成，当前仅以前端草案实现 `POST /api/v1/auth/login` 和 `GET /api/v1/auth/me`；真实联调、403/503/网络异常展示和 token 过期策略待后端接口可用后补验。
- `T-0013-auth-ui-shell` 当前使用 `sessionStorage` 临时保存 access token、token type 和非敏感用户展示信息，用于阶段 1 本地会话恢复；该方案仍受同源 XSS 影响，不是生产最终方案，后续应评估 HttpOnly、Secure、SameSite Cookie 或后端托管 refresh token 方案。
- `T-0013-auth-ui-shell` 本轮没有引入全站路由守卫，避免在后端契约未稳定前阻断现有控制台；后续补守卫时必须同步补路由守卫测试。
- `T-0011` 本轮只补前端静态检查门禁，未新增业务功能；ESLint 规则采用推荐集和 React 运行时相关规则，后续若加入格式化工具或类型感知规则，需要再评估 CI 时长和误报成本。
- 后端 T-0006 项目、环境、服务 API 已在后端 worktree 的 `agents/runtime/api-contracts/backend.md` 登记；前端已按该契约对齐 `key` 和必填 `environment_id`。
- `T-0009` 本轮目标是不依赖后端服务已启动的联调准备；未启动真实后端，未执行浏览器 E2E 或真实接口联调，待后端阶段 1 服务可用后补验 404/409/422 实际响应。
- `T-0007` 本轮未做浏览器联调；待后端接口完成后补真实接口联调和必要的 E2E 覆盖。
- `T-0007-fix` 本轮仍未做浏览器联调；当前复验范围为 typecheck、test、build，真实后端联调和 E2E 待后续审计或集成任务补充。
- 实际前端开发分支 `feature/frontend-dev` 已创建并推送。
- 本机 Node.js 为 `v24.13.0`，已按 Node 24 LTS 固定前端运行时。

### 下一步

- `T-0018-subpath-api-config` 提交并推送 `feature/frontend-dev` 后，由总 agent 安排审计，并在部署/Nginx 任务中补验 `/xxx/` 静态资源、`/xxx/settings` 刷新直达和 `/xxx/api` 代理路径。
- `T-0013-auth-ui-shell` 等待后端认证接口落地后，补真实接口联调、401/403/过期 token 行为验证，并评估最终 token 存储与刷新策略。
- `T-0009` 等待总 agent 汇总当前审计结论并推进集成；后端阶段 1 接口可用后补真实接口联调。
- `T-0007-fix` 提交并推送 `feature/frontend-dev` 后，由总 agent 重新启动代码审计 agent 审计本次修复。
- 由总 agent 启动代码审计 agent 审计 `T-0007` 前端 Settings/基础管理页面骨架。
- 由总 agent 重新启动代码审计 agent 审计 `T-0004` 前端审计修复。
- 待后端健康检查契约稳定后，将总览页健康状态接入真实 `GET /health` 响应并补充前端测试。

### 验证

- `T-0018-subpath-api-config` 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过，`npm.cmd run typecheck` 初次因 `vite.config.ts` 引入 `src/config/basePaths.ts` 但 `tsconfig.node.json` 未包含该文件失败，补充 include 后重跑通过，`npm.cmd run test` 通过（6 个测试文件、28 个测试通过），`npm.cmd run build` 通过。
- `T-0015-authenticated-settings-client` 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过，`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过（5 个测试文件、22 个测试通过），`npm.cmd run build` 通过。
- `T-0015-authenticated-settings-client` 已执行 `git diff --check` 通过；已确认 `frontend/dist/`、`frontend/node_modules/`、`agents/runtime/*.log.md`、真实 `.env*` 均命中 ignore 规则，未进入待提交列表。
- `T-0013-fix` 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过，`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过（3 个测试文件、15 个测试通过），`npm.cmd run build` 通过。
- `T-0013-fix` 已执行 `git diff --check` 通过；提交前检查显示 `frontend/dist/`、`frontend/node_modules/`、`agents/runtime/*.log.md` 仍为 ignored，未进入待提交列表。
- `T-0013-auth-ui-shell` 开发中已执行 `npm.cmd run typecheck`，初次发现 headers 类型和 Windows 大小写文件名问题，修复后重跑通过。
- `T-0013-auth-ui-shell` 初次完整验证中 `npm.cmd run lint` 因 React Hooks `set-state-in-effect` 规则失败，已将恢复中状态改为由 session 派生；`npm.cmd run test` 因单测复用同一个 `Response` body 失败，已改为每次请求返回新 `Response`。
- `T-0013-auth-ui-shell` 修复后已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过，`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过（2 个测试文件、11 个测试通过），`npm.cmd run build` 通过。
- `T-0011-frontend-ci-lint-fix` 已在 `frontend/` 包目录执行：`npm.cmd run lint` 通过，`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过（1 个测试文件、7 个测试通过），`npm.cmd run build` 通过。
- `T-0011-frontend-ci-lint-fix` 执行 `npm.cmd install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals` 后，npm audit 结果为 0 个漏洞。
- `T-0011-frontend-ci-lint-fix` 已检查待提交和 ignored 文件，`frontend/dist/`、`frontend/node_modules/`、`agents/runtime/*.log.md` 均命中 `.gitignore`，未进入待提交列表。
- `T-0009` 已由测试子 agent Beauvoir 复验：`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过，`npm.cmd run build` 通过；Vitest 共 1 个测试文件、7 个测试通过。
- 测试子 agent Beauvoir 已检查待提交和 ignored 文件，未发现 `frontend/dist/`、`frontend/node_modules/`、日志或真实 env 进入待提交/未跟踪列表；`frontend/dist/`、`frontend/node_modules/`、`agents/runtime/*.log.md` 和常见真实 env 均命中 ignore 规则。
- `T-0009` 未运行 lint，未启动 dev/preview 服务，未做浏览器交互、截图、E2E 或真实后端 API 联调，已记录为后续补验边界。
- `T-0009` 首个测试子 agent Beauvoir 初次在 worktree 根目录执行 npm 命令失败，原因是根目录无 `package.json`；已在实际包目录 `frontend/` 重跑并通过。冗余测试子 agent Goodall 已关闭，未产生提交。
- `T-0009` 前端开发 agent 已执行 `git check-ignore -v agents/runtime/frontend-agent.log.md agents/runtime/test-agent.log.md`，确认本地运行日志被 `.gitignore` 规则忽略；日志文件内容保留在本地。
- `T-0007-fix` 已由测试子 agent Faraday 复验：`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过，`npm.cmd run build` 通过；前端开发 agent 未代跑测试子 agent 的验证命令。
- 测试子 agent Faraday 已检查待提交和 ignored 文件，未发现 `.env`、密钥、证书私钥、`frontend/dist/`、`frontend/node_modules/` 进入待提交列表。
- `T-0007-fix` 未运行 `lint`，未启动 dev/preview 服务，未做浏览器交互、截图、E2E 或后端真实 API 联调，已记录为后续补验边界。
- `T-0007` 已由测试子 agent Locke 复验：初次因 `node_modules` 不存在失败；执行 `npm.cmd ci` 后，`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过，`npm.cmd run build` 通过。测试日志已写入 `agents/runtime/test-agent.log.md`。
- 测试子 agent Locke 已检查待提交和 ignored 文件，未发现 `.env`、密钥、证书私钥、`frontend/dist/`、`frontend/node_modules/` 进入待提交列表。
- 前端开发 agent 未代跑测试子 agent 负责的 `typecheck`、`test`、`build` 验证命令。
- 已执行 `npm.cmd install` 生成并同步 `package-lock.json`，npm audit 结果为 0 个漏洞。
- 已由前端开发 agent 按测试 agent 规范启动/执行测试验证：`npm.cmd run typecheck` 通过，`npm.cmd run build` 通过。
- 已启动测试子 agent Kant 独立复验：`npm.cmd run typecheck` 通过，`npm.cmd run test` 通过，`npm.cmd run build` 通过，`npm.cmd audit --audit-level=moderate` 通过。
- 本轮在新增父子 agent 边界要求后，前端开发 agent 没有代跑测试子 agent 负责的 `typecheck`、`test`、`build` 验证命令。
