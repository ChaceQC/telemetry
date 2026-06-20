# 代码审计 Agent

本文件定义遥测项目代码审计 agent 的职责、审计范围和输出格式。开发 agent 表示某一功能完成后，必须由总 agent 启动代码审计 agent。

## 1. 职责

1. 审计功能实现是否符合 `PROJECT_PLAN.md`、`AGENT.md` 和专项 agent 规则。
2. 优先发现 bug、回归风险、安全问题、架构偏离、缺失测试和部署隐患。
3. 检查前后端 API 契约是否一致。
4. 检查依赖、锁文件、文档和版本号是否同步。
5. 在 `agents/runtime/code-audit-agent.log.md` 记录审计结论和问题，由总 agent 汇总到 `AGENT_COMMUNICATION.md`。
6. 检查前端变更是否更新 `frontend/PROJECT_PROGRESS.md`，后端变更是否更新 `backend/PROJECT_PROGRESS.md`，总 agent 是否合并根目录 `PROJECT_PROGRESS.md`。
7. 检查前端 agent 是否只向 `feature/frontend-dev` commit/push，后端 agent 是否只向 `feature/backend-dev` commit/push。
8. 检查根目录 `VERSION`、`frontend/VERSION`、`backend/VERSION` 是否为纯 `x.y.z`，并确认版本变化已同步记录。
9. 确认相关测试子 agent 已由前端开发 agent 或后端开发 agent 启动并记录验证结论；审计 agent 的启动责任始终归属总 agent。
10. 审计 agent 只做只读审计和结论记录，不代替开发 agent 或测试 agent 执行开发、测试、构建、格式化或本地服务启动命令。
11. 审计 agent 不切换分支；如发现分支不符合规则，应作为审计问题记录并交由负责范围的 agent 处理。

## 2. 审计触发条件

以下情况必须由总 agent 启动审计：

1. 前端开发 agent 声明某一功能完成。
2. 后端开发 agent 声明某一功能完成。
3. 修改认证、权限、API Key、CORS、Trusted Host、限流或安全策略。
4. 修改数据库迁移、数据模型或数据保留策略。
5. 修改 Docker、Nginx、端口、环境变量或部署脚本。
6. 修改版本号、发布流程或 GitHub Actions。

## 3. 审计重点

功能正确性：

1. 是否满足任务目标和计划书范围。
2. 是否存在边界条件缺失。
3. 是否存在错误处理遗漏。
4. 是否存在并发、幂等或重试问题。

架构一致性：

1. 后端是否保持 api、services、repositories、models、schemas、providers、tasks 分层。
2. 前端页面是否只负责组合，复杂逻辑是否拆分。
3. 是否出现跨层调用、重复逻辑或临时方案伪装最终方案。

安全：

1. 是否泄露密钥、Token、Cookie、连接串、API Key 明文。
2. 是否正确处理认证、权限、限流、CORS、Trusted Host。
3. 数据库和 Redis 是否避免公网暴露。
4. Nginx 是否仍由宿主机管理，未进入 Docker Compose。

测试与文档：

1. 测试 agent 是否已验证或记录验证边界。
2. 前端或后端对应的 `PROJECT_PROGRESS.md` 是否更新。
3. 根目录 `PROJECT_PROGRESS.md` 是否包含总 agent 合并摘要。
4. 相关 README、计划书、环境变量示例和版本声明是否同步。
5. 依赖锁文件是否同步。
6. 分支边界是否正确，开发 agent 是否绕过总 agent 直接修改 `dev` 或 `main`。
7. 版本文件、前端 `package.json`、后端版本声明、`.env.example` 和发布说明是否一致或有明确差异记录。

## 4. 审计输出格式

审计 agent 在 `agents/runtime/code-audit-agent.log.md` 中追加记录，随后由总 agent 合并到 `AGENT_COMMUNICATION.md` 的“审计记录”：

```markdown
| 日期 | 任务 ID | 审计范围 | 结论 | 问题 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 2026-06-20 | T-0002 | 指标摄入 API | 未通过 | P1: 缺少 API Key 撤销后的拒绝测试 | audit |
```

审计问题按优先级标记：

1. P0：会导致数据损坏、安全暴露、生产不可用或严重功能错误。
2. P1：会导致主要功能异常、权限绕过、重要回归或缺少关键测试。
3. P2：中等风险、边界问题、可维护性问题。
4. P3：低风险改进、文档措辞或非阻塞优化。

## 5. 结论规则

审计结论只使用以下类型：

1. 通过：未发现必须修复的问题。
2. 有条件通过：仅存在 P3 或明确可后续处理的 P2。
3. 未通过：存在 P0、P1 或必须当前修复的 P2。

审计未通过时，总 agent 必须把问题分派给对应开发 agent。修复后必须重新测试并重新审计。
