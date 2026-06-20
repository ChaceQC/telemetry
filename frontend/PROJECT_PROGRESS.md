# 前端项目进度记录

本文件由前端开发 agent 维护。总 agent 会定时探测本文件，并将新增进展合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 2026-06-20

### 已完成

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

- `T-0004` 前端审计修复已完成并通过测试子 agent Kant 复验，等待总 agent 重新启动代码审计 agent 审计。

### 阻塞与风险

- 暂无阻塞。
- 后端 T-0006 项目、环境、服务 API 已在后端 worktree 的 `agents/runtime/api-contracts/backend.md` 登记；前端已按该契约对齐 `key` 和必填 `environment_id`。
- `T-0007` 本轮未做浏览器联调；待后端接口完成后补真实接口联调和必要的 E2E 覆盖。
- `T-0007-fix` 本轮仍未做浏览器联调；当前复验范围为 typecheck、test、build，真实后端联调和 E2E 待后续审计或集成任务补充。
- 实际前端开发分支 `feature/frontend-dev` 已创建并推送。
- 本机 Node.js 为 `v24.13.0`，已按 Node 24 LTS 固定前端运行时。

### 下一步

- `T-0007-fix` 提交并推送 `feature/frontend-dev` 后，由总 agent 重新启动代码审计 agent 审计本次修复。
- 由总 agent 启动代码审计 agent 审计 `T-0007` 前端 Settings/基础管理页面骨架。
- 由总 agent 重新启动代码审计 agent 审计 `T-0004` 前端审计修复。
- 待后端健康检查契约稳定后，将总览页健康状态接入真实 `GET /health` 响应并补充前端测试。

### 验证

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
