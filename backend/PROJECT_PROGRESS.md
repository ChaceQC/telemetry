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

## 2026-06-20 T-0010-backend-ci-mysql-fix

### 已完成

- 修复 MySQL downgrade 顺序：`20260620_0001_create_management_tables.py` 不再在 `management_services` 表存在时先删除 `ix_management_services_project_id` / `ix_management_services_environment_id`，改为按子表到父表直接删除表，由 MySQL 随表释放外键和支撑索引，避免错误 1553。
- 后端 dev 依赖新增 `mypy` 并更新 `uv.lock`，补充 `[tool.mypy]` 基础配置，使 GitHub Actions 中的 `uv run mypy .` 能实际执行类型检查。
- 修复 mypy 暴露的轻量类型问题：SQLite 连接事件回调、内存 repository 过滤变量类型、测试中 `TestClient.app` 到 `FastAPI` 的显式 cast。
- 更新 `backend/README.md` 验证命令，纳入 `uv run mypy .`。

### 进行中

- 等待测试 agent 在真实 MySQL 环境中补跑 `uv run alembic upgrade head` 和 `uv run alembic downgrade base`。

### 阻塞与风险

- 当前后端 worktree 没有真实 MySQL 服务，本次只能完成 SQLite 升降级和 MySQL 离线 SQL 静态检查；错误 1553 的最终闭环需测试 agent 在真实 MySQL 中确认。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 下一步

- 由测试 agent 使用真实 MySQL 补验 upgrade head、downgrade base，并回归基础管理 API 的唯一约束和外键约束。
- 后续继续处理认证/权限和分页契约，不属于本次 CI/MySQL downgrade 修复范围。

### 验证

- 已运行 `uv run mypy .`，结果：38 个源文件无类型错误。
- 已运行 `uv run pytest`，结果：18 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：38 个文件已格式化。
- 已使用 `sqlite:///./tmp-t0010-ci-mysql-fix.db` 运行 `uv run alembic -x database_url=sqlite:///./tmp-t0010-ci-mysql-fix.db upgrade head` 和 `uv run alembic -x database_url=sqlite:///./tmp-t0010-ci-mysql-fix.db downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。
- 已运行 MySQL dialect 离线 SQL 生成：`uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' upgrade head --sql` 和 `uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' downgrade 20260620_0001:base --sql`；downgrade SQL 输出为先 `DROP TABLE management_services`，再删除父表，不再输出先删除外键支撑索引的语句。

## 2026-06-20 T-0012-auth-foundation

### 已完成

- 新增阶段 1 最小认证基础：`POST /api/v1/auth/login`、`GET /api/v1/auth/me` 和可复用 `get_current_user` 依赖。
- 新增 `auth_users` 用户表 ORM 模型与 Alembic 迁移 `20260620_0002_create_auth_users.py`，字段包含 `username`、`email`、`password_hash`、展示名、启停状态、超级用户标记和时间戳。
- 新增 `pwdlib[argon2]` 和 `PyJWT` 依赖并更新 `uv.lock`；密码哈希和 JWT 编解码均使用成熟库，不自写核心算法。
- 新增 `AuthService`、`SqlAlchemyAuthRepository` 和认证 Pydantic schema；登录失败统一返回“用户名或密码错误”，避免账号枚举；响应不返回 `password_hash`。
- 新增认证配置：`AUTH_SECRET_KEY`、`AUTH_TOKEN_ALGORITHM`、`AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`；未配置密钥时认证接口返回 `503`。
- 补充 `backend/tests/test_auth_api.py`，覆盖登录成功、登录失败、密码不明文保存、受保护依赖识别当前用户、缺失/无效 token 拒绝。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录认证接口契约、敏感字段日志边界、迁移表和验证边界。

### 进行中

- 等待总 agent 后续按需启动测试 agent 和代码审计 agent，对认证基础做独立复验与审计。

### 阻塞与风险

- 当前没有开放用户注册或管理员创建用户 API；测试通过 repository 创建用户，后续需补管理员用户初始化/创建流程。
- 当前仅提供认证身份识别骨架，尚未将基础管理 API 强制接入登录态、角色或项目权限；后续需逐步补权限策略和越权测试。
- 当前 worktree 没有真实 MySQL 服务，本次只能用 SQLite 覆盖迁移链和认证 API；MySQL 用户唯一索引、布尔默认值和迁移升降级仍需容器环境补验。
- `AUTH_SECRET_KEY` 必须在真实环境配置为足够长的随机密钥，不得提交到 Git。

### 下一步

- 设计管理员初始账号创建方式，并在不暴露明文密码日志的前提下补初始化文档或管理 API。
- 为基础管理 API 接入 `get_current_user`、角色/项目权限策略和越权拒绝测试。
- 由测试 agent 在真实 MySQL 环境中补跑 `uv run alembic upgrade head`、`uv run alembic downgrade base`、认证登录和用户唯一约束验证。

### 验证

- 已运行 `uv run pytest tests/test_auth_api.py`，结果：4 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：22 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：45 个文件已格式化。
- 已运行 `uv run mypy .`，结果：45 个源文件无类型错误。
- 已使用 `sqlite:///./tmp-t0012-auth-foundation.db` 运行 `uv run alembic -x database_url=sqlite:///./tmp-t0012-auth-foundation.db upgrade head` 和 `uv run alembic -x database_url=sqlite:///./tmp-t0012-auth-foundation.db downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。
- 已运行 MySQL dialect 离线 SQL 生成：`uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' upgrade head --sql` 和 `uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' downgrade 20260620_0002:base --sql`；输出包含 `auth_users` 建表、唯一索引和回滚删除语句。真实 MySQL 执行仍需测试 agent 补验。

## 2026-06-20 T-0012-fix

### 已完成

- 修复审计 P2：登录时账号不存在也执行固定 Argon2 dummy hash 校验，减少用户名枚举时序差异；账号不存在、密码错误和停用账号统一返回 `用户名或密码错误`。
- 修复审计 P2：`AUTH_SECRET_KEY` 在 token 签发和解析前强制至少 32 个 UTF-8 字节；未配置或弱密钥统一让认证接口返回 `503`。
- 修复审计 P3：受保护接口 OpenAPI security scheme 改为 HTTP Bearer，不再误声明 OAuth2 password flow；`POST /api/v1/auth/login` 保持 JSON 请求体契约。
- 补充认证测试，覆盖登录成功的有效 32 字节密钥、未配置密钥、弱密钥、未知用户 dummy hash 校验、HTTP Bearer OpenAPI 描述、密码非明文保存和 token 依赖拒绝路径。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录认证密钥强度、统一失败文案、dummy hash 边界和 Bearer token 契约。

### 进行中

- 等待总 agent 后续按需启动独立测试 agent 或代码审计 agent 复验本次修复。

### 阻塞与风险

- 本次未修改数据库模型或 Alembic migration，因此未额外运行 SQLite Alembic 升降级；真实 MySQL 认证用户唯一约束和迁移链风险延续自 `T-0012-auth-foundation`，仍需容器环境补验。
- 固定 dummy hash 只能降低账号枚举时序差异，不能替代限流、审计告警、登录失败计数和 IP/账号维度防爆破策略；这些仍需后续安全任务补齐。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 下一步

- 后续认证/权限任务继续补登录限流、失败审计、管理员账号初始化、角色/项目权限和越权拒绝测试。
- 由测试 agent 在真实 MySQL 环境中补跑迁移、认证登录和用户唯一约束验证。

### 验证

- 已运行 `uv run pytest tests/test_auth_api.py`，结果：9 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：27 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：45 个文件已格式化。
- 已运行 `uv run mypy .`，结果：45 个源文件无类型错误。

## 2026-06-20 T-0014-protect-management-api

### 已完成

- 将项目、环境、服务管理 API 接入最小认证要求：`GET/POST /api/v1/projects`、`GET/POST /api/v1/environments`、`GET/POST /api/v1/services` 均需要有效 Bearer token 和启用用户。
- 管理路由通过 `get_current_user` 复用现有认证依赖；缺失 token、无效/过期 token、token 对应用户不存在或用户已停用继续沿用当前 auth 依赖的 401 行为。
- 保持管理 API 响应字段稳定，未在响应中新增用户或权限字段。
- 补充管理 API 测试，覆盖未认证被拒、无效 token 被拒、停用用户 token 被拒、有效用户可创建/读取项目/环境/服务，以及 OpenAPI Bearer security 声明。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，明确当前只做最小认证，项目级 RBAC、团队/角色授权和越权判定留给后续权限任务。

### 进行中

- 等待总 agent 后续按需启动独立测试 agent 或代码审计 agent 复验本次管理 API 认证接入。

### 阻塞与风险

- 当前仍未实现项目级 RBAC、团队/角色权限或越权判定；任何启用用户拿到有效 token 后都能访问和创建所有项目、环境、服务。
- 当前没有开放用户创建管理界面或初始化 CLI；测试通过 repository 创建用户，真实环境仍需后续补管理员初始化流程。
- 当前 worktree 没有真实 MySQL 服务，本次管理 API 认证接入主要通过 SQLite API 测试验证；MySQL 迁移链和用户唯一约束风险延续自认证基础任务。

### 下一步

- 设计项目级角色/权限模型，并补项目读取、环境管理、服务管理的越权拒绝测试。
- 补管理员初始账号创建方式，并确保初始化过程不泄露密码、token 或密钥。

### 验证

- 已运行 `uv run pytest`，结果：46 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：45 个文件已格式化。
- 已运行 `uv run mypy .`，结果：45 个源文件无类型错误。
