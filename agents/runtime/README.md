# Agent 运行时沟通目录

本目录用于避免多个 agent 同时修改 `AGENT_COMMUNICATION.md` 产生冲突。规则如下：

1. `AGENT_COMMUNICATION.md` 是总 agent 汇总文件，只允许总 agent 修改。
2. 前端、后端、测试、审计 agent 只追加自己的日志文件，不直接修改总沟通文件。
3. 总 agent 定期读取本目录日志，将稳定结论合并到 `AGENT_COMMUNICATION.md` 和根 `PROJECT_PROGRESS.md`。
4. 每条日志使用追加写入，不删除历史记录。
5. API 契约草案先写入 `api-contracts/`，由总 agent 合并为正式契约。
6. 具体执行事件必须写入对应角色的 `*.log.md` 文件，README 只保留目录用途、写入规则和格式约定。

推荐事件格式：

```markdown
## 2026-06-20T15:30:00+08:00
- agent: frontend
- task: T-0004
- worktree: C:\Users\q-lau\Documents\telemetry-worktrees\frontend
- branch: feature/frontend-dev
- status: done
- summary: 修复前端审计问题。
- files:
  - frontend/package.json
- validation:
  - npm.cmd run test
- commit: 未提交，原因是等待审计通过。
- needs_total_agent: true
```

如果日志之间存在冲突，总 agent 在 `AGENT_COMMUNICATION.md` 记录冲突和决议。
