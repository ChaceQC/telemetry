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

## 3. 总协调流程

1. 每个任务开始前，总 agent 先读取 `PROJECT_PLAN.md`、`AGENT.md`、相关专项 agent 文件和 `AGENT_COMMUNICATION.md`。
2. 总 agent 将任务拆成前端、后端、测试、审计可执行事项，并写入 `AGENT_COMMUNICATION.md`。
3. 前端开发 agent 和后端开发 agent 可以同时推进，但必须通过 `AGENT_COMMUNICATION.md` 对齐 API、字段、状态、错误码、端口和阻塞问题。
4. 开发 agent 在开发过程中遇到测试需求时，必须调用测试 agent 设计并执行对应验证。
5. 开发 agent 表示某一功能完成后，总 agent 必须启动代码审计 agent 进行审计。
6. 审计通过后，总 agent 再决定是否进入提交、推送、发布或下一功能。
7. 审计未通过时，总 agent 将问题写入 `AGENT_COMMUNICATION.md`，分派给对应开发 agent 修复，修复后再次测试和审计。
8. 前端开发 agent 每次实现、重构、测试或依赖调整后，必须更新 `frontend/PROJECT_PROGRESS.md`。
9. 后端开发 agent 每次实现、重构、测试、迁移或依赖调整后，必须更新 `backend/PROJECT_PROGRESS.md`。
10. 总 agent 必须定时探测 `frontend/PROJECT_PROGRESS.md` 和 `backend/PROJECT_PROGRESS.md`，将新增进展、阻塞、验证和下一步合并摘要到根目录 `PROJECT_PROGRESS.md`。
11. 根目录 `PROJECT_PROGRESS.md` 是项目级汇总，不替代前后端各自的进度文件。
12. 总 agent 维护根目录 `VERSION`，前端开发 agent 维护 `frontend/VERSION`，后端开发 agent 维护 `backend/VERSION`。

## 4. 并行开发规则

1. 前后端可以同时开发，但 API 契约必须先在 `AGENT_COMMUNICATION.md` 中登记。
2. 后端变更接口路径、请求体、响应体、错误码、权限或分页规则时，必须更新沟通文件中的 API 契约。
3. 前端如果需要新增字段、接口、筛选条件、图表数据或交互状态，必须先在沟通文件提出契约需求。
4. 任一 agent 发现契约冲突，应先在沟通文件登记冲突，再由总 agent 决定取舍。
5. 不允许通过口头约定替代沟通文件记录。

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

## 9. 版本文件规则

1. 根目录 `VERSION` 由总 agent 维护，表示项目总版本。
2. `frontend/VERSION` 由前端开发 agent 维护，表示前端版本。
3. `backend/VERSION` 由后端开发 agent 维护，表示后端版本。
4. 所有 `VERSION` 文件只能包含纯 `x.y.z`，不得包含 `alpha`、`beta`、`rc` 或其他后缀。
5. 未达到可上线稳定版本前，所有版本必须保持 `0.y.z`。
6. 前端或后端版本变化后，开发 agent 必须更新对应子进度文件；总 agent 探测后决定是否同步提升根目录 `VERSION`。
7. 发布、tag 或合并到 `main` 前，总 agent 必须确认三个 `VERSION` 文件、`.env.example`、后端版本声明、前端 `package.json` 和发布说明一致或已记录差异原因。
