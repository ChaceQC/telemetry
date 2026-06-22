# 遥测平台

本仓库是遥测平台的根工作树，负责项目计划、协作规则、项目级基础设施、部署草案和 CI 配置。前端与后端开发由独立 Git worktree 承担，根工作树默认只做总协调、集成、文档和发布相关变更。

## 当前阶段

当前版本为 `0.2.0`，处于阶段 3 查询与展示 MVP。当前已具备认证与基础管理、API Key、metrics/logs/events 摄入、摄入统计、查询 API、查询页分页和 metrics 当前页趋势图基础。

## 目录结构

```text
.
├── AGENT.md                  # 总 agent 协作规则
├── AGENT_COMMUNICATION.md    # 总 agent 维护的正式沟通板
├── PROJECT_PLAN.md           # 项目计划书
├── PROJECT_PROGRESS.md       # 项目级进度汇总
├── VERSION                   # 项目总版本
├── backend/                  # 后端目录，后端 agent 维护
├── frontend/                 # 前端目录，前端 agent 维护
├── agents/                   # agent 角色说明和运行时日志
├── docker/                   # 本地开发数据库初始化脚本
├── scripts/                  # 协作和初始化脚本
├── .env.example              # 本地开发环境变量示例
├── docker-compose.dev.yml    # 本地数据库服务 Compose 草案
└── .github/workflows/ci.yml  # GitHub Actions 基础 CI 草案
```

## 独立 worktree

并行开发不直接使用根工作树写前端或后端代码。默认 worktree：

```text
C:\Users\q-lau\Documents\telemetry-worktrees\frontend
C:\Users\q-lau\Documents\telemetry-worktrees\backend
```

初始化或修复 worktree 可在根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Initialize-AgentWorktrees.ps1
```

开工或提交后先执行严格只读体检：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-AgentWorktreeState.ps1
```

提交前如根工作树正有本次待提交改动，可用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-AgentWorktreeState.ps1 -AllowPendingChanges
```

该脚本检查三个 worktree 是否在预期分支、是否干净、是否误追踪 `auth.txt`、`.env`、`agents/runtime/*.log.md`、依赖目录或构建产物，并提示 feature 分支中尚未进入 `dev` 历史的提交。feature 分支若含早期过程历史、运行日志或已集成提交，总 agent 先创建备份引用并清理 feature 分支拓扑，再使用真实 `git merge` 集成到 `dev`。

分支约定：

| 范围 | 分支 | 目录 |
| --- | --- | --- |
| 项目级基础设施和集成 | `dev` | 根工作树 |
| 前端开发 | `feature/frontend-dev` | `..\telemetry-worktrees\frontend` |
| 后端开发 | `feature/backend-dev` | `..\telemetry-worktrees\backend` |

## Windows 本地开发

1. 安装 Git、Docker Desktop、Node.js LTS、uv 和 Python 3.12。
2. 在根目录复制环境变量示例：

```powershell
Copy-Item .env.example .env
```

3. 按需调整 `.env` 中端口、host 和本地数据库占位配置；示例中的数据库密码仅用于本地开发占位，不得用于生产。
4. 启动本地数据库服务：

```powershell
docker compose --env-file .env -f docker-compose.dev.yml up -d
```

5. 在后端独立 worktree 启动后端：

```powershell
cd C:\Users\q-lau\Documents\telemetry-worktrees\backend\backend
uv run python main.py
```

6. 在前端独立 worktree 启动前端：

```powershell
cd C:\Users\q-lau\Documents\telemetry-worktrees\frontend\frontend
npm run dev
```

本地联调或验证结束后，关闭本次启动的前端、后端、预览服务，并确认项目端口不再由本次进程监听。

## 端口约定

| 服务 | 宿主机端口 | 默认 host | 说明 |
| --- | ---: | --- | --- |
| Frontend Vite | `25173` | `127.0.0.1` | 前端开发服务 |
| Frontend Preview | `25174` | `127.0.0.1` | 前端构建预览 |
| Backend API | `28117` | `127.0.0.1` | FastAPI 开发服务 |
| MySQL | `23316` | `127.0.0.1` | 仅本机访问 |
| ClickHouse HTTP | `28123` | `127.0.0.1` | 仅本机访问 |
| ClickHouse Native | `29001` | `127.0.0.1` | 仅本机访问 |
| MongoDB | `27018` | `127.0.0.1` | 仅本机访问 |
| Redis | `26380` | `127.0.0.1` | 仅本机访问 |

生产环境由 Debian 宿主机 Nginx 监听外部入口，例如 HTTPS `28443` 和可选 HTTP 跳转 `28081`。Nginx 不进入 Docker Compose。

## 前后端启动入口

后端入口：

```powershell
cd backend
uv run python main.py
```

前端开发入口：

```powershell
cd frontend
npm run dev
```

前端预览入口：

```powershell
cd frontend
npm run preview
```

API base URL 默认使用：

```text
http://127.0.0.1:28117
```

前端通过 `VITE_API_BASE_URL` 读取后端地址。

## Docker Compose 开发环境

`docker-compose.dev.yml` 只包含 MySQL、ClickHouse、MongoDB 和 Redis 等本地开发依赖服务。后端、前端和 Nginx 不在本轮 Compose 草案中托管。

MySQL 会使用 `.env` 中的 `MYSQL_ROOT_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_USER` 和 `MYSQL_PASSWORD` 初始化 root 与应用用户。MongoDB 会使用 `MONGODB_ROOT_USER`、`MONGODB_ROOT_PASSWORD` 创建 root 用户，并通过 `docker/mongodb/init-app-user.js` 使用 `MONGODB_DATABASE`、`MONGODB_USER` 和 `MONGODB_PASSWORD` 创建应用库读写用户。

启动：

```powershell
docker compose --env-file .env -f docker-compose.dev.yml up -d
```

停止：

```powershell
docker compose -f docker-compose.dev.yml down
```

如需清理本地数据卷，必须确认不再需要开发数据后再执行带 `-v` 的清理命令。

## CI 草案

`.github/workflows/ci.yml` 当前规划：

1. 后端：`uv run ruff check .`、`uv run ruff format --check .`、`uv run mypy .`、`uv run pytest`。
2. 前端：`npm ci`、`npm run lint`、`npm run typecheck`、`npm test`。

工作流会先检测对应项目文件是否存在。当前 `dev` 分支的前后端骨架尚未完全合入时，对应 job 会跳过执行并输出原因。

## 安全边界

`.env.example` 只包含本地开发占位凭据，不包含真实密钥。真实 `.env`、证书私钥、数据库 dump、上传文件、依赖目录和构建产物不得提交。数据库服务在开发 Compose 中绑定 `127.0.0.1`，不作为公网入口。
