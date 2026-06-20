# Agent 运行时沟通目录

本目录用于避免多个 agent 同时修改 `AGENT_COMMUNICATION.md` 产生冲突。规则如下：

1. `AGENT_COMMUNICATION.md` 是总 agent 汇总文件，只允许总 agent 修改。
2. 前端、后端、测试、审计 agent 只追加自己的日志文件，不直接修改总沟通文件。
3. 总 agent 定期读取本目录日志，将稳定结论合并到 `AGENT_COMMUNICATION.md` 和根 `PROJECT_PROGRESS.md`。
4. 每条日志使用追加写入，不删除历史记录。
5. API 契约草案先写入 `api-contracts/`，由总 agent 合并为正式契约。

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

## 2026-06-20T15:59:00+08:00
- agent: total
- task: T-0005
- worktree: C:\Users\q-lau\Documents\telemetry
- branch: dev
- status: done
- summary: 推进阶段 0 项目级基础设施，新增根 README、根 `.env.example`、开发 Docker Compose 草案和 GitHub Actions 基础 CI 草案；同步更新根进度。
- files:
  - README.md
  - .env.example
  - docker-compose.dev.yml
  - .github/workflows/ci.yml
  - PROJECT_PROGRESS.md
  - agents/runtime/README.md
- validation:
  - 仅执行 UTF-8 只读检查、Git 状态检查、敏感文件关键字检查和锁文件影响检查。
  - 执行 `docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet`，仅验证 Compose 配置展开，未启动容器。
  - 按用户边界未运行前端或后端测试、构建、lint 或服务启动命令。
  - 未修改 AGENT_COMMUNICATION.md。
- commit: 本日志随本次项目级基础设施提交一并提交；最终 commit id 以 Git 记录和最终汇报为准。
- needs_total_agent: false
