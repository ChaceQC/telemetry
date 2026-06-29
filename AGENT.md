# 项目总 Agent

本文件定义遥测项目的总协调 agent。所有开发、测试、审计和部署相关工作必须优先遵守 `PROJECT_PLAN.md`，并按本文协调前端开发 agent、后端开发 agent、测试 agent 和代码审计 agent。

## 1. 基本原则

1. 文件读写、终端输入输出统一使用 UTF-8。
2. 项目文档、README、代码注释和面向用户的文案默认使用中文；命令、变量名、协议名、第三方产品名、API 字段和行业通用术语可保留英文。
3. 开发环境默认为 Windows 11，部署环境默认为 Debian。
4. 后端使用 Python + uv，前端使用 React + TypeScript + Vite + npm。
5. 开发过程中缺少必要依赖时，可根据项目技术栈自行补全依赖、锁文件、配置和文档，不需要等待用户确认。
6. 执行 Git 操作不需要用户逐次确认，但必须先检查状态、文档同步、锁文件同步和敏感文件。
7. 未到可上线稳定版本前，版本号必须采用 `0.y.z`；版本变化必须同步更新项目文档、后端版本声明、前端 `package.json`、`.env.example` 和发布说明。
8. Nginx 必须运行在 Debian 宿主机，不进入 Docker Compose；最终公网入口由宿主机 Nginx 反向代理到 Docker 内部服务。
9. 生产访问入口必须按 `https://域名/xxx` 形式设计和验证，前端路由、静态资源路径、API base URL、CORS、Trusted Host 和 Nginx 反代规则不得假设用户通过裸 IP、直连端口或仅根路径访问。
10. 本地开发和测试都在 Windows 11 上执行；所有 agent 编写或执行终端命令时必须优先使用 PowerShell、Windows 可用命令或跨平台工具，不得使用 Linux 专用命令、路径或 shell 语法来作为本地可用前提。
11. 前端开发、前端调试和前端测试涉及真实浏览器时，必须使用 Playwright 操作 Microsoft Edge；如 Edge 不可用，必须记录例外原因、替代浏览器和影响范围。
12. 本地验证不得启动本机 Docker；需要 MySQL 时直接使用本地 MySQL 服务、临时库或本地 MySQL 实例，并记录连接方式、临时库名和清理结果。
13. 开发时依旧必须考虑 Debian 部署兼容性；代码、脚本、配置、依赖和路径处理不得引入只在 Windows 可用的生产运行假设。

## 2. Agent 组成

1. 总 agent：读取计划、拆分任务、协调顺序、维护沟通文件、决定何时进入测试和审计。
2. 前端开发 agent：负责 React 前端实现、前端测试、前端文档和与后端契约对齐。
3. 后端开发 agent：负责 Python 后端实现、数据库迁移、服务接口、后台任务和后端文档。
4. 测试 agent：负责按功能和风险设计验证方案，执行或指导单元、集成、端到端、部署和安全验证。
5. 代码审计 agent：负责功能完成后的代码审计，重点检查缺陷、回归风险、安全问题、架构偏离和测试缺口。

专项 agent 规则位于：

```text
agents/frontend-agent.md
agents/backend-agent.md
agents/test-agent.md
agents/code-audit-agent.md
```

统一沟通文件：

```text
AGENT_COMMUNICATION.md
```

运行时分片沟通目录：

```text
agents/runtime/
```

## 3. 总协调流程

1. 每个任务开始前，总 agent 先读取 `PROJECT_PLAN.md`、`AGENT.md`、相关专项 agent 文件和 `AGENT_COMMUNICATION.md`。
2. 总 agent 将任务拆成前端、后端、测试、审计可执行事项，并写入 `AGENT_COMMUNICATION.md`。
3. 涉及代码、依赖或工程配置变更的任务，总 agent 必须在开始编写代码前启动对应开发子 agent；跨端任务必须分别启动前端开发子 agent 和后端开发子 agent。
4. 开发子 agent 的启动时间、任务边界、负责目录、当前状态和例外原因必须由总 agent 写入 `AGENT_COMMUNICATION.md`，不得用口头约定替代。
5. 前端开发 agent 和后端开发 agent 可以同时推进，但不得直接修改 `AGENT_COMMUNICATION.md`；过程信息只追加本地 ignored 的 `agents/runtime/*.log.md`，API 契约写入可入库的 `agents/runtime/api-contracts/*.md`，再由总 agent 汇总 API、字段、状态、错误码、端口和阻塞问题。
6. 前端开发 agent 和后端开发 agent 在开发过程中遇到测试需求时，必须各自启动测试子 agent 设计并执行对应验证。
7. 开发 agent 表示某一功能完成后，总 agent 必须启动代码审计子 agent 进行审计。
8. 审计通过后，总 agent 再决定是否进入提交、推送、发布或下一功能。
9. 审计未通过时，总 agent 将问题写入 `AGENT_COMMUNICATION.md`，分派给对应开发 agent 修复，修复后再次测试和审计。
10. 前端开发 agent 每次实现、重构、测试或依赖调整后，必须更新 `frontend/PROJECT_PROGRESS.md`。
11. 后端开发 agent 每次实现、重构、测试、迁移或依赖调整后，必须更新 `backend/PROJECT_PROGRESS.md`。
12. 总 agent 必须定时探测 `frontend/PROJECT_PROGRESS.md` 和 `backend/PROJECT_PROGRESS.md`，将新增进展、阻塞、验证和下一步合并摘要到根目录 `PROJECT_PROGRESS.md`。
13. 根目录 `PROJECT_PROGRESS.md` 是项目级汇总，不替代前后端各自的进度文件。
14. 总 agent 维护根目录 `VERSION`，前端开发 agent 维护 `frontend/VERSION`，后端开发 agent 维护 `backend/VERSION`。
15. 总 agent 不得代替前端开发 agent、后端开发 agent 或测试 agent 执行其负责范围内的开发、测试、构建、格式化或启动命令；总 agent 只负责拆分、记录、状态探测、审计触发、根进度合并和最终集成。
16. 子 agent 不得代替其启动的孙 agent 执行孙 agent 负责的测试、审计或修复任务；只能接收孙 agent 结论、整合记录并处理自己负责范围内的后续工作。
17. 每个 agent 完成一个可验证小步后，不得长期保持未提交状态；负责该写入范围的 agent 必须自行检查状态、文档、锁文件和敏感文件，并按所属分支提交和尽量推送。
18. 开发型子 agent 必须在独立 Git worktree 中工作；根工作树只允许总 agent 做规则维护、汇总、审计触发、集成和发布。
19. 默认 worktree 路径为 `..\telemetry-worktrees\frontend` 和 `..\telemetry-worktrees\backend`，可通过 `scripts/Initialize-AgentWorktrees.ps1` 创建。
20. 每次推送到会触发 GitHub Actions 的分支后，总 agent 必须读取对应 Actions run 结果，将成功、失败 job、失败步骤和后续处理写入 `AGENT_COMMUNICATION.md` 与根 `PROJECT_PROGRESS.md`。
21. 每次开工、集成或提交后，总 agent 必须执行 `powershell -ExecutionPolicy Bypass -File scripts/Test-AgentWorktreeState.ps1` 进行严格只读体检；提交前如根工作树正有本次待提交改动，可执行 `powershell -ExecutionPolicy Bypass -File scripts/Test-AgentWorktreeState.ps1 -AllowPendingChanges` 检查分支和保护项。若失败，先整理 worktree、分支、敏感文件、运行日志和未提交改动，再继续开发或集成。
22. 总 agent、开发 agent、测试 agent 和审计 agent 只允许关闭或清理由自己本次明确启动并记录的进程、端口、浏览器会话、临时数据库和临时资源；不得按端口或进程名宽泛关闭可能属于用户或其他 agent 的服务。
23. 总 agent 启动子 agent 后默认进入静默协调模式，不得干扰正在工作的子 agent：不得主动催促、插话、追加非必要要求、要求中间汇报，或进行短间隔重复轮询。只有在子 agent 已交付最终结果、明确阻塞、用户要求介入、发现会导致返工的硬性边界冲突、必须关闭已结束 agent、或超出合理等待窗口且下一步确实被阻塞时，才允许一次性、具体、必要地介入；介入后继续保持静默等待。
24. 后续启动开发、测试或审计子 agent 时，思考强度默认选择 `xhigh`，并在启动记录中写明任务边界、是否可再启动测试 agent、不得代跑完整测试流程和只清理自有资源等约束。

## 4. 并行开发规则

1. 前后端可以同时开发，但必须分别在独立 worktree 内工作，不得共用根工作树写代码。
2. API 契约必须先进入 `agents/runtime/api-contracts/` 草案文件，再由总 agent 合并到 `AGENT_COMMUNICATION.md` 的正式契约。
3. 后端变更接口路径、请求体、响应体、错误码、权限或分页规则时，必须更新 `agents/runtime/api-contracts/backend.md`。
4. 前端如果需要新增字段、接口、筛选条件、图表数据或交互状态，必须先在 `agents/runtime/api-contracts/frontend-requests.md` 提出契约需求。
5. 任一 agent 发现契约冲突，应先在自己的本地运行时日志中登记冲突，再由总 agent 决定取舍并写入 `AGENT_COMMUNICATION.md`。
6. 总 agent 不得绕过已定义的开发子 agent 直接长期承担前端或后端开发；若因工具不可用、任务极小或用户明确要求而例外，必须在 `AGENT_COMMUNICATION.md` 记录原因。
7. 同一时间只允许负责当前写入范围的 agent 在自己的 worktree 中切换分支；总 agent 不替子 agent 切换分支，多个 agent 不得在同一 worktree 同时执行分支切换。
8. 不允许通过口头约定替代运行时日志和总沟通文件记录。

## 5. 测试与审计门禁

功能进入“完成”状态必须满足：

1. 开发 agent 已完成实现并更新相关文档。
2. 测试 agent 已执行或记录合理验证边界。
3. 前端或后端对应的 `PROJECT_PROGRESS.md` 已记录本次变更、验证和下一步。
4. 总 agent 已将相关摘要合并到根目录 `PROJECT_PROGRESS.md`。
5. 代码审计 agent 已审计通过，或审计问题已全部关闭。

若测试无法执行，必须在 `PROJECT_PROGRESS.md` 和最终说明中记录原因、影响范围和后续补验方式。

## 6. 进度探测与合并

1. 总 agent 在每次任务开始、开发 agent 声明完成、测试完成、审计完成、准备 Git 提交前，都必须探测前后端进度文件。
2. 探测来源：
   - `frontend/PROJECT_PROGRESS.md`
   - `backend/PROJECT_PROGRESS.md`
   - `AGENT_COMMUNICATION.md`
   - `agents/runtime/*.log.md`
   - `agents/runtime/api-contracts/*.md`
3. 合并目标为根目录 `PROJECT_PROGRESS.md`。
4. 合并时保留项目级摘要，不逐字复制所有子进度；但必须包含日期、完成事项、阻塞风险、验证结果、审计结论和下一步。
5. 如果前后端进度互相冲突，总 agent 必须先在 `AGENT_COMMUNICATION.md` 记录冲突和决议，再更新根目录进度。
6. 如果某一端进度文件缺失或未更新，总 agent 必须在根目录进度中记录风险，并要求对应开发 agent 补齐。

## 7. 端口与部署边界

1. 本地前端默认端口 `25173`，前端预览端口 `25174`，后端端口 `28117`。
2. 生产 Nginx HTTPS 默认端口 `28443`，可选 HTTP 跳转端口 `28081`。
3. 避免使用常见端口，也避免复用其他项目或早期草案端口。
4. 端口、域名、数据库连接、CORS、Trusted Host、上传目录和 API 地址必须来自配置文件或环境变量。
5. Docker Compose 禁止包含 Nginx 服务。
6. 生产路径必须支持 `https://域名/xxx`；如果前端部署在子路径，Vite base、React Router basename、资源路径和 API 前缀必须同步配置并测试。

## 8. Git 规则

1. 默认主分支为 `main`，日常开发分支为 `dev`。
2. 前端开发 agent 默认只在 `feature/frontend-dev` 分支工作，只能向该分支 commit 和 push。
3. 后端开发 agent 默认只在 `feature/backend-dev` 分支工作，只能向该分支 commit 和 push。
4. 测试 agent 和代码审计 agent 默认不直接提交业务代码；若确需提交测试或审计修复，必须由总 agent 指定分支和范围。
5. 总 agent 负责将 `feature/frontend-dev` 和 `feature/backend-dev` 合并入 `dev`。
6. 总 agent 仅在版本发布、阶段验收或必要稳定节点，将 `dev` 合并入 `main`。
7. 开发 agent 不得直接向 `dev` 或 `main` commit、push 或 merge。
8. 完成一个可验证小步后即可在所属分支 commit 并 push，不需要用户逐次确认。
9. commit message 可使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:` 等前缀，但冒号后的说明必须使用中文。
10. 提交前必须检查 `git status`。
11. 禁止提交 `.env`、密钥、证书私钥、依赖目录、构建产物、上传文件和备份文件。
12. 必须提交锁文件，例如 `uv.lock` 和 `package-lock.json`。
13. 分支合并、冲突解决、`dev` 到 `main` 的提升和 tag 发布由总 agent 负责。
14. 分支切换由拥有对应写入范围的 agent 自行执行并在 `AGENT_COMMUNICATION.md` 记录；总 agent 只有在执行集成、合并或发布时才切换分支。
15. 不允许长期累积未提交改动；若因共享工作树、分支切换锁、审计未通过或阻塞问题暂不能提交，必须在 `AGENT_COMMUNICATION.md` 和对应进度文件记录原因、影响范围和下一次提交条件。
16. 前端开发 agent 的默认工作目录为独立 worktree `..\telemetry-worktrees\frontend`；后端开发 agent 的默认工作目录为独立 worktree `..\telemetry-worktrees\backend`。
17. 根工作树不得作为并行开发目录；若历史遗留改动已在根工作树或错误分支中产生，必须先冻结新开发，由总 agent 拆分迁移或要求对应 agent 在所属 worktree 重新提交。
18. `AGENT_COMMUNICATION.md` 只允许总 agent 修改；子 agent 通过 ignored 的 `agents/runtime/*.log.md` 追加本地过程日志，不提交不 push；总 agent 汇总稳定结论后再修改总沟通文件。
19. `agents/runtime/api-contracts/*.md` 是可提交的契约草案；`agents/runtime/*.log.md` 是本地临时通信文件，已进入 `.gitignore`，不得 stage、commit 或 push。
20. 推送后不得只依赖本地测试结论；总 agent 必须读取 GitHub Actions 对应 run，若失败则记录失败原因、处理任务和下一次复查条件。
21. 根工作树、前端 worktree、后端 worktree 必须保持“一目录一分支一职责”：`dev` 只在根工作树，`feature/frontend-dev` 只在前端 worktree，`feature/backend-dev` 只在后端 worktree；可用 `scripts/Test-AgentWorktreeState.ps1` 检查偏离。
22. 总 agent 集成到 `dev` 时默认使用真实 `git merge`，保持 GitHub 分支管理和提交拓扑清晰。如果 feature 分支历史包含早期运行日志、已按路径集成过的提交或其他污染，必须先备份并清理 feature 分支，使其以当前 `dev` 为基线且只包含尚未集成的有效提交，再执行 merge；不得用长期 path restore 替代分支治理。
23. 任一 agent 启动本地服务、浏览器自动化、数据库临时库或后台辅助进程时，必须记录启动方式、PID 或唯一资源标识；结束时只清理这些自己启动的资源。如果端口已被他人占用，应换端口或报告阻塞，不得直接终止占用进程。

## 9. 版本文件规则

1. 根目录 `VERSION` 由总 agent 维护，表示项目总版本。
2. `frontend/VERSION` 由前端开发 agent 维护，表示前端版本。
3. `backend/VERSION` 由后端开发 agent 维护，表示后端版本。
4. 所有 `VERSION` 文件只能包含纯 `x.y.z`，不得包含 `alpha`、`beta`、`rc` 或其他后缀。
5. 未达到可上线稳定版本前，所有版本必须保持 `0.y.z`。
6. 前端或后端版本变化后，开发 agent 必须更新对应子进度文件；总 agent 探测后决定是否同步提升根目录 `VERSION`。
7. 发布、tag 或合并到 `main` 前，总 agent 必须确认三个 `VERSION` 文件、`.env.example`、后端版本声明、前端 `package.json` 和发布说明一致或已记录差异原因。
