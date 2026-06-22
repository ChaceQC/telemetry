# Agent 运行时沟通目录

本目录用于避免多个 agent 同时修改 `AGENT_COMMUNICATION.md` 产生冲突。规则如下：

1. `AGENT_COMMUNICATION.md` 是总 agent 汇总文件，只允许总 agent 修改。
2. 前端、后端、测试、审计 agent 只追加自己的本地日志文件，不直接修改总沟通文件。
3. 总 agent 定期读取本目录日志，将稳定结论合并到 `AGENT_COMMUNICATION.md` 和根 `PROJECT_PROGRESS.md`。
4. 每条日志使用追加写入，不删除历史记录。
5. `*.log.md` 是本地临时通信文件，已由 `.gitignore` 忽略，不得 stage、commit 或 push。
6. API 契约草案先写入 `api-contracts/`，由总 agent 合并为正式契约；契约草案可以随代码提交。
7. 具体执行事件必须写入对应角色的 `*.log.md` 文件，README 只保留目录用途、写入规则和格式约定。

## 统一环境约束

所有 agent 写入运行时日志、测试记录、审计记录或 API 契约草案时，必须同时遵守并记录以下边界：

1. 本地开发和测试运行在 Windows 11，命令必须优先使用 PowerShell、Windows 可用命令或跨平台工具；不得把 Linux 专用命令、路径或 shell 语法当作本地可用前提。
2. 前端开发、调试和测试涉及真实浏览器时，默认使用 Playwright 操作 Microsoft Edge；如 Edge 不可用，必须记录例外原因、替代浏览器和影响范围。
3. 本地验证不得启动本机 Docker；需要 MySQL 时直接使用本地 MySQL 服务、临时库或本地 MySQL 实例，并记录连接方式、临时库名和清理结果。
4. 虽然本地开发和测试在 Windows 11 上执行，代码、脚本、配置、依赖、路径处理和部署记录仍必须考虑 Debian 部署兼容性。

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
- commit: 本地日志不提交；业务提交等待审计通过。
- needs_total_agent: true
```

如果日志之间存在冲突，总 agent 在 `AGENT_COMMUNICATION.md` 记录冲突和决议。
