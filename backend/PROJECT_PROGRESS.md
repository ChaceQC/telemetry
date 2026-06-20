# 后端项目进度记录

本文件由后端开发 agent 维护。总 agent 会定时探测本文件，并将新增进展合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 2026-06-20

### 已完成

- 建立后端进度记录文件。
- 创建 `backend/VERSION`，初始版本为 `0.1.0`。
- 完成 `T-0003` 后端 Python + uv + FastAPI 项目骨架。
- 补齐 `pyproject.toml`、`uv.lock`、`main.py` 和 `app/` 分层目录。
- 实现配置读取：`BACKEND_PORT` 优先，其次 `PORT`，默认端口 `28117`；版本默认读取 `backend/VERSION`。
- 实现 FastAPI app factory，并注册 `GET /health` 健康检查接口。
- 增加健康检查和配置读取单元测试，覆盖默认端口、环境变量端口优先级和版本读取。
- 更新 `backend/README.md`，记录启动方式、环境变量、健康检查契约、目录结构和验证边界。

### 进行中

- 等待总 agent 对 `T-0003` 启动代码审计 agent。

### 阻塞与风险

- 暂无阻塞。
- 实际后端开发分支 `feature/backend-dev` 已创建并推送。
- 当前任务未引入数据库、迁移、认证、摄入、查询和告警逻辑；相关集成测试需在后续功能任务中补充。
- `uv run pytest` 出现 1 条来自 FastAPI/Starlette TestClient 的上游弃用警告，不影响当前测试通过，后续依赖升级时关注。

### 下一步

- 由总 agent 启动代码审计 agent 审计 `T-0003`。
- 审计通过后进入 Docker Compose 开发环境、`.env.example` 或下一批后端领域接口任务。

### 验证

- 已运行 `uv run pytest`，结果：6 个测试通过，1 条上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：26 个文件已格式化。
- 已用 `BACKEND_PORT=28121`、`APP_ENV=test-startup` 执行 `uv run python main.py` 启动探针，请求 `GET http://127.0.0.1:28121/health` 返回 `status=ok`、`version=0.1.0`、`environment=test-startup`、`port=28121`；探针结束后确认端口 `28121` 已释放。
- 已启动测试子 agent `Boole` 做独立复验，结论为通过；Boole 另用临时端口 `38117` 启动并请求 `/health` 成功，验证后确认端口 `38117` 不再监听。

## 2026-06-20 T-0006

### 已完成

- 完成阶段 1 最小基础管理 API：`GET/POST /api/v1/projects`、`GET/POST /api/v1/environments`、`GET/POST /api/v1/services`。
- 新增 `backend/app/schemas/management.py`、`backend/app/services/management.py`、`backend/app/repositories/management.py` 和 `backend/app/api/routes/management.py`，保持 API、schema、service、repository 分层。
- 当前 repository 使用进程内 `InMemoryManagementRepository`，用于先稳定 API 契约和前端联调；已在 README、API 草案和运行日志中标明后续 MySQL 替换点。
- 使用 Pydantic 校验基础字段：`name`、`key`、`description`、`project_id`、`environment_id`、`status`。
- 补充 `backend/tests/test_management_api.py`，覆盖成功创建/列表、无效 payload、重复 key、缺失项目和服务项目归属冲突。
- 更新 `backend/README.md`，记录基础管理 API、字段契约和临时内存仓储边界。
- 追加 `agents/runtime/api-contracts/backend.md` 和 `agents/runtime/backend-agent.log.md`。
- 已启动测试子 agent `Averroes` 独立复验，要求写入 `agents/runtime/test-agent.log.md`。

### 进行中

- 等待总 agent 后续启动代码审计 agent。

### 阻塞与风险

- 暂无阻塞。
- 当前管理 API 暂未接入认证/权限，阶段 1 后续认证任务需补登录态、项目权限和越权测试。
- 当前内存 repository 进程重启即丢失数据，不支持跨进程共享、持久化事务和数据库唯一索引；后续 MySQL 迁移任务必须替换 repository 并补 Alembic migration。
- 当前列表接口未分页，因内存版仅用于联调契约；MySQL 版本需补分页参数和测试。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过，后续依赖升级时跟踪。

### 下一步

- 接入阶段 1 认证/权限后，为基础管理 API 增加登录态、项目权限和越权拒绝测试。
- MySQL 元数据迁移任务中新增项目、环境、服务表和唯一索引，并用持久化 repository 替换 `InMemoryManagementRepository`。

### 验证

- 后端开发 agent 已运行 `uv run pytest`，结果：11 个测试通过，1 条上游弃用警告。
- 后端开发 agent 已运行 `uv run ruff check .`，结果：通过。
- 测试子 agent `Averroes` 已独立复验，结论为有条件通过；`uv run pytest`、`uv run ruff check .`、`uv run ruff format --check .` 当前均通过。复验记录到 `agents/runtime/test-agent.log.md`，并标明认证、持久化、分页和更多边界测试待后续任务补齐。

## 2026-06-20 T-0008

### 已完成

- 先完成日志规则清理：`.gitignore` 新增 `agents/runtime/*.log.md`，并将 `agents/runtime/backend-agent.log.md`、`agents/runtime/test-agent.log.md` 从 Git 跟踪中移除但保留本地文件内容；已独立提交并推送。
- 新增 SQLAlchemy 2.x、Alembic、PyMySQL 依赖并更新 `uv.lock`。
- 新增数据库基础模块：`app/db/base.py`、`app/db/session.py`，通过 `DATABASE_URL` 创建 engine 和请求级 session factory。
- 新增项目、环境、服务 ORM 模型：`management_projects`、`management_environments`、`management_services`。
- 新增 Alembic 迁移 `20260620_0001_create_management_tables.py`，包含 MySQL `utf8mb4` 表选项、外键、唯一约束和索引。
- 将基础管理 API 默认数据访问从 `InMemoryManagementRepository` 切换为 `SqlAlchemyManagementRepository`，保留 `ManagementService` 归属校验和现有路由/响应契约。
- 补充 SQLite/SQLAlchemy 测试，覆盖 API 创建/列表、重复项目 key、重复环境 key、重复服务 key、缺失项目和服务项目归属冲突。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录迁移运行方式、`DATABASE_URL` 配置、当前验证边界和后续 MySQL 容器补验要求。

### 进行中

- 等待总 agent 后续启动测试子 agent 和代码审计 agent，对本次持久化基础做独立复验与审计。

### 阻塞与风险

- 当前 worktree 没有真实 MySQL 运行时，本次未执行 MySQL 容器 migration/API 集成验证；SQLite 只能覆盖 SQLAlchemy 行为、约束映射和 Alembic 基础链路，不能完全代表 MySQL 外键、字符集、排序规则和锁/事务行为。
- 默认 `DATABASE_URL=sqlite:///./telemetry-dev.db` 仅作为无 MySQL 时的本地开发兜底；部署和集成环境必须显式配置 MySQL 连接。
- 管理 API 仍未接入认证/权限，阶段 1 后续认证任务需补登录态、项目权限和越权拒绝测试。
- 当前列表接口仍未分页；持久化后数据量上来前需补分页参数、索引策略和对应测试。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过，后续依赖升级时跟踪。
- 本次未代跑测试子 agent 任务；仅记录后端开发 agent 自测结果，独立复验需由总 agent 或测试 agent 后续执行。

### 下一步

- 由测试 agent 在可用 MySQL 容器环境中补跑 `uv run alembic upgrade head`、基础管理 API 创建/重复 key/外键归属验证和回滚策略检查。
- 接入阶段 1 认证/权限后，为基础管理 API 增加登录态、项目权限和越权拒绝测试。
- 为项目、环境和服务列表接口补分页契约、查询参数和持久化分页测试。

### 验证

- 已运行 `uv run pytest`，结果：15 个测试通过，1 条上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：38 个文件已格式化。
- 已使用 `DATABASE_URL=sqlite:///./tmp-alembic-check.db` 运行 `uv run alembic upgrade head` 和 `uv run alembic downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。

## 2026-06-20 T-0008-fix

### 已完成

- 修复审计 P2：`management_services` 保留 API 契约中的 `project_id`，并新增数据库级 `(environment_id, project_id)` 复合外键，引用 `management_environments(id, project_id)`；环境表新增对应唯一约束，确保服务写入时环境必须属于同一项目。
- 同步更新 ORM 模型和 Alembic 初始迁移，保留现有响应字段和前端契约。
- 修复审计 P2：`SqlAlchemyManagementRepository` 不再把所有 `IntegrityError` 伪装成重复 key；唯一约束映射为 `DuplicateResourceError`，外键约束区分缺失项目、缺失环境和服务项目/环境归属冲突，未知完整性错误映射为 `ResourceIntegrityError`。
- 补充测试覆盖数据库层拒绝服务项目/环境不一致写入、环境外键缺失不误报 duplicate key、未知 `IntegrityError` 不误报 duplicate key。
- 修复审计 P3：更新 `backend/README.md` 目录结构和管理 API 说明，明确默认 SQLAlchemy repository、测试用内存 repository 与 SQLite 验证边界。
- 更新 `agents/runtime/api-contracts/backend.md`，记录复合外键、完整性错误映射和验证边界。

### 进行中

- 等待总 agent 后续按需启动独立测试子 agent 或代码审计 agent 复验本次修复。

### 阻塞与风险

- 当前 worktree 仍没有真实 MySQL 运行时，本次只能用 SQLite 覆盖 SQLAlchemy 行为、复合外键约束和 Alembic 升降级；MySQL 外键名、索引行为和字符集排序规则仍需容器环境补验。
- 管理 API 仍未接入认证/权限，列表接口仍未分页；这些风险延续自 T-0008，不属于本次审计修复范围。
- 本次不代跑测试子 agent 任务；仅记录后端开发 agent 自测结果和边界。

### 下一步

- 在 MySQL 容器环境中补跑 migration、服务项目/环境复合外键、重复 key 映射和 API 集成验证。
- 后续认证/权限任务继续补登录态、项目权限、越权拒绝和分页契约。

### 验证

- 已运行 `uv run pytest`，结果：18 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：38 个文件已格式化。
- 已使用 `DATABASE_URL=sqlite:///./tmp-t0008-fix-alembic.db` 运行 `uv run alembic upgrade head` 和 `uv run alembic downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。
