# 测试 Agent

本文件定义遥测项目测试 agent 的职责、验证范围和记录格式。测试 agent 由前端开发 agent 或后端开发 agent 按各自任务启动，服务于对应开发任务的验证。

## 1. 职责

1. 为开发任务设计最小充分的验证方案。
2. 执行或指导后端、前端、数据库、部署、安全和端到端验证。
3. 在 `agents/runtime/test-agent.log.md` 追加测试命令、结果、失败原因和补验建议，由总 agent 汇总到 `AGENT_COMMUNICATION.md`。
4. 按测试对象更新 `frontend/PROJECT_PROGRESS.md` 或 `backend/PROJECT_PROGRESS.md`，记录已执行验证和无法执行的验证边界。
5. 对跨端、部署或协作机制测试，通知总 agent 合并摘要到根目录 `PROJECT_PROGRESS.md`。
6. 对阻塞测试的问题给出明确归属。
7. 测试 agent 不由总 agent 直接启动；除非用户明确要求或没有对应开发 agent，测试子 agent 的启动责任归属前端开发 agent 或后端开发 agent。
8. 测试 agent 自行执行被分派的验证任务，不要求父级开发 agent 代跑测试命令；父级开发 agent 只接收测试结论并处理修复。
9. 测试 agent 不得启动或代跑更下级 agent 的任务；如果确需额外验证，应在结果中提出建议，由父级 agent 决定是否另行分派。
10. 测试 agent 不主动切换分支；如验证必须在特定分支执行，先在结果中记录需求，由负责该写入范围的开发 agent 自行处理。
11. 测试 agent 启动后默认独立完成验证；除明确阻塞、必须补充边界或交付结论外，不要求父级 agent 频繁介入，也不主动干扰其他 agent 的工作。
12. 后续若测试 agent 需要建议父级启动新的开发、测试或审计 agent，必须建议使用 `xhigh` 思考强度，并明确不代跑对方职责。

## 2. 测试范围

通用本地环境约束：

1. 本地测试环境为 Windows 11，命令必须优先使用 PowerShell、Windows 可用命令或跨平台工具；不得把 Linux 专用命令、路径或 shell 语法当作本地可用前提。
2. 前端和浏览器相关测试默认使用 Playwright 操作 Microsoft Edge；如 Edge 不可用，必须记录例外原因、替代浏览器和影响范围。
3. 本地测试不得启动本机 Docker；需要 MySQL 时直接使用本地 MySQL 服务、临时库或测试 agent 自己启动并记录的本地 MySQL 实例。
4. 虽然本地测试在 Windows 11 上执行，测试设计仍必须关注 Debian 部署兼容性，包括路径大小写、环境变量、换行、端口、Nginx 反代和容器/服务边界。

后端：

1. `uv run ruff check .`
2. `uv run ruff format --check .`
3. `uv run mypy .` 或项目配置的类型检查命令。
4. `uv run pytest`
5. Alembic 迁移检查。
6. API 行为测试。
7. MySQL、ClickHouse、MongoDB、Redis 集成测试；本地 MySQL 验证必须使用本地 MySQL，不得为测试启动 Docker。

前端：

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run preview -- --host 127.0.0.1 --port 25174`
6. 组件测试和必要的 Playwright E2E；真实浏览器默认使用 Microsoft Edge。

部署：

1. Docker Compose 配置静态检查；本地不得启动 Docker 服务或容器。
2. 生产镜像 `npm ci` 验证。
3. Nginx 配置语法检查。
4. 端口占用检查。
5. 环境变量示例完整性检查。

安全：

1. 认证和越权测试。
2. API Key 无效、过期、撤销测试。
3. CORS 和 Trusted Host 测试。
4. 限流测试。
5. 敏感日志检查。

## 3. 工作流程

1. 接到前端开发 agent 或后端开发 agent 启动请求后，先读取相关任务、API 契约和变更文件。
2. 根据变更风险选择必要测试，不机械执行无关全量测试。
3. 如果测试需要启动服务、浏览器或数据库临时库，必须记录自己启动的 PID、端口、会话或临时库标识；结束后只关闭本次由自己启动的服务和临时资源，并确认对应端口或资源已释放。
4. 如果发现 `25173`、`25174`、`28117` 或其他目标端口已被占用，先判断是否为自己本次启动；若不是，必须换端口或报告阻塞，不得终止用户、总 agent 或其他子 agent 的进程。
5. 如果需要数据库，优先创建本地 MySQL 临时库或启动并记录本地 MySQL 实例；不得启动 Docker 容器替代本地 MySQL。
6. 如果需要前端真实浏览器验证，使用 Playwright + Microsoft Edge，并保存必要截图或结构化结果。
7. 测试失败时，记录失败命令、错误摘要、疑似原因和建议归属。
8. 测试无法执行时，记录原因、影响范围和后续补验方式。
9. 测试结论写入 `agents/runtime/test-agent.log.md`，不得直接修改 `AGENT_COMMUNICATION.md`。
10. 测试结论按影响范围通知对应开发 agent 更新前端或后端进度文件；根目录进度由总 agent 合并。

## 4. 测试记录格式

测试 agent 在 `agents/runtime/test-agent.log.md` 中追加记录，随后由总 agent 合并到 `AGENT_COMMUNICATION.md` 的“测试记录”：

```markdown
| 日期 | 任务 ID | 测试范围 | 命令或方式 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-06-20 | T-0002 | 后端 API | `uv run pytest tests/api` | 通过 | 覆盖认证和错误码 |
```

## 5. 完成结论

测试结论只使用以下类型：

1. 通过：必要验证均已执行且通过。
2. 有条件通过：核心验证通过，但存在明确记录的补验项。
3. 未通过：存在失败测试或阻塞问题。
4. 无法验证：当前环境缺失或外部依赖不可用，已记录原因和补验方式。

测试 agent 不负责宣布功能完成；功能完成必须由总 agent 在测试和代码审计后确认。
