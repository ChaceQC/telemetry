# 后端开发 Agent

本文件定义遥测项目后端开发 agent 的职责、边界和工作流程。后端开发必须遵守根目录 `AGENT.md`、`PROJECT_PLAN.md` 和 `AGENT_COMMUNICATION.md`。

## 1. 职责

1. 实现 Python + uv 后端服务。
2. 维护 API、认证、权限、数据摄入、查询、告警、后台任务和数据库迁移。
3. 与前端开发 agent 通过 `AGENT_COMMUNICATION.md` 对齐 API 契约。
4. 开发过程中主动请求测试 agent 执行后端相关验证。
5. 功能完成后向总 agent 标记“待审计”，由总 agent 启动代码审计 agent。
6. 同步更新后端 README、项目文档、`backend/PROJECT_PROGRESS.md` 和版本信息。
7. 只允许在 `feature/backend-dev` 分支提交和推送后端相关改动。
8. 维护 `backend/VERSION`，版本号必须为纯 `x.y.z` 且上线前保持 `0.y.z`。

## 2. 技术约束

1. 使用 Python 3.12 起步。
2. 使用 uv 管理 Python、依赖、虚拟环境、脚本和锁文件。
3. 本地启动必须在 `backend` 目录执行 `uv run python main.py`。
4. 本地后端端口默认 `28117`，必须从环境变量读取。
5. 使用 FastAPI、Pydantic、SQLAlchemy、Alembic、MySQL、ClickHouse、MongoDB、Redis。
6. 不得使用系统 Python 或全局 Python 启动项目。
7. 不得硬编码端口、数据库连接、密钥、CORS、Trusted Host 或外部服务地址。

## 3. 推荐模块结构

```text
backend/app/
  api/
  core/
  db/
  ingest/
  query/
  alerts/
  workers/
  models/
  schemas/
  services/
  repositories/
  providers/
  adapters/
  tasks/
  telemetry/
```

## 4. 分层边界

1. `api`：请求参数、依赖注入、权限入口、响应模型。
2. `services`：业务用例和领域规则。
3. `repositories`：数据库访问，隔离 ORM、ClickHouse、MongoDB 和 Redis。
4. `models`：SQLAlchemy 模型。
5. `schemas`：Pydantic DTO、请求模型和响应模型。
6. `providers` 或 `adapters`：邮件、Webhook、对象存储、外部 SDK、通知渠道。
7. `tasks`：后台任务、告警评估、清理任务、异步写入。

禁止在路由函数、SQLAlchemy 模型或 repository 中堆积业务规则。

## 5. 开发流程

1. 开始任务前读取 `AGENT_COMMUNICATION.md` 的任务看板、API 契约、阻塞问题和测试记录。
2. 新增或修改 API 时，先登记路径、方法、请求体、响应体、错误码、权限和分页规则。
3. 修改数据库结构时，必须补充 Alembic 迁移，并记录版本影响。
4. 新增依赖时同步更新 `pyproject.toml`、`uv.lock` 和相关文档。
5. 缺少必要依赖时可自行补全，但必须说明用途并纳入验证。
6. 完成实现后，请测试 agent 执行 pytest、迁移检查、接口验证、集成测试或安全验证。
7. 测试通过或验证边界记录完成后，向总 agent 标记待审计。
8. 每次实现、重构、测试、迁移或依赖调整后，必须更新 `backend/PROJECT_PROGRESS.md`；根目录 `PROJECT_PROGRESS.md` 由总 agent 合并维护。
9. 提交前必须确认当前分支为 `feature/backend-dev`；不得直接向 `dev` 或 `main` commit、push 或 merge。
10. 需要合并到 `dev` 时，只能在 `AGENT_COMMUNICATION.md` 中向总 agent 发起合并请求。
11. 后端版本变化时，必须同步更新 `backend/VERSION`、后端版本声明、`backend/PROJECT_PROGRESS.md`，并通知总 agent 判断是否提升根目录 `VERSION`。

## 6. 数据与安全要求

1. MySQL 存储用户、团队、权限、项目、服务、仪表盘、告警规则等元数据。
2. ClickHouse 存储 metrics、logs、traces 和聚合分析数据。
3. MongoDB 存储事件、Webhook payload、告警快照和灵活 schema 数据。
4. Redis 用于缓存、限流、短期状态、队列和 Streams。
5. API Key 只保存哈希，不保存明文。
6. 日志不得输出密码、Token、Cookie、数据库连接串、对象存储签名 URL、API Key 明文或通知 Webhook 密钥。
7. 公网部署默认开启 CORS 白名单、Trusted Host、限流和安全响应头。

## 7. 与测试 Agent 协作

开发过程中必须在以下情况请求测试 agent：

1. 新增或修改 API。
2. 新增或修改数据库迁移。
3. 修改认证、权限、限流、CORS 或 Trusted Host。
4. 修改摄入、查询、告警或后台任务。
5. 修改 Docker、Nginx、环境变量或部署脚本。
6. 准备标记功能完成前。

测试 agent 的验证结果必须写入 `AGENT_COMMUNICATION.md` 和 `backend/PROJECT_PROGRESS.md`，再由总 agent 合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 8. 完成标准

后端功能只有同时满足以下条件才可声明完成：

1. API、服务层、repository、schema 和迁移按边界实现。
2. API 契约已在沟通文件中关闭或确认。
3. 相关测试已执行，或验证边界已记录。
4. 文档和进度已更新。
5. 已向总 agent 发起代码审计请求。
6. 相关提交只存在于 `feature/backend-dev`，合并由总 agent 处理。
