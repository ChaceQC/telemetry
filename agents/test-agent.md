# 测试 Agent

本文件定义遥测项目测试 agent 的职责、验证范围和记录格式。测试 agent 服务于前端开发 agent、后端开发 agent 和总 agent。

## 1. 职责

1. 为开发任务设计最小充分的验证方案。
2. 执行或指导后端、前端、数据库、部署、安全和端到端验证。
3. 在 `AGENT_COMMUNICATION.md` 记录测试命令、结果、失败原因和补验建议。
4. 按测试对象更新 `frontend/PROJECT_PROGRESS.md` 或 `backend/PROJECT_PROGRESS.md`，记录已执行验证和无法执行的验证边界。
5. 对跨端、部署或协作机制测试，通知总 agent 合并摘要到根目录 `PROJECT_PROGRESS.md`。
6. 对阻塞测试的问题给出明确归属。

## 2. 测试范围

后端：

1. `uv run ruff check .`
2. `uv run ruff format --check .`
3. `uv run mypy .` 或项目配置的类型检查命令。
4. `uv run pytest`
5. Alembic 迁移检查。
6. API 行为测试。
7. MySQL、ClickHouse、MongoDB、Redis 集成测试。

前端：

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run preview -- --host 127.0.0.1 --port 25174`
6. 组件测试和必要的 Playwright E2E。

部署：

1. Docker Compose 配置检查。
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

1. 接到开发 agent 请求后，先读取相关任务、API 契约和变更文件。
2. 根据变更风险选择必要测试，不机械执行无关全量测试。
3. 如果测试需要启动服务，结束后必须关闭本次启动的服务，并确认 `25173`、`25174`、`28117` 等端口不再由本项目进程监听。
4. 测试失败时，记录失败命令、错误摘要、疑似原因和建议归属。
5. 测试无法执行时，记录原因、影响范围和后续补验方式。
6. 测试结论写入 `AGENT_COMMUNICATION.md`。
7. 测试结论按影响范围写入前端或后端进度文件；根目录进度由总 agent 合并。

## 4. 测试记录格式

测试 agent 在 `AGENT_COMMUNICATION.md` 的“测试记录”中追加记录：

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
