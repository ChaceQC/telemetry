# 前端项目进度记录

本文件由前端开发 agent 维护。总 agent 会定时探测本文件，并将新增进展合并摘要到根目录 `PROJECT_PROGRESS.md`。

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
