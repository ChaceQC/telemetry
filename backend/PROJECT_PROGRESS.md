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

## 2026-06-20 T-0017-cors-proxy-config

### 已完成

- 为 FastAPI app 增加可配置 CORS middleware，配置来自 `BACKEND_CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS`、允许方法、允许请求头和凭据开关；本地/测试环境默认允许项目约定前端 origin，生产环境默认不开放 CORS origin。
- 为 FastAPI app 增加 `TrustedHostMiddleware`，配置来自 `BACKEND_TRUSTED_HOSTS` / `TRUSTED_HOSTS`；本地/测试默认包含 `localhost`、`127.0.0.1`、`[::1]` 和 `testserver`，生产需显式配置公网域名。
- 增加 `BACKEND_ROOT_PATH` / `ROOT_PATH` 配置并传入 `FastAPI(root_path=...)`，用于 `https://域名/xxx` 子路径反代场景下的 OpenAPI server 前缀。
- 增加 `BACKEND_PROXY_HEADERS` / `PROXY_HEADERS` 和 `BACKEND_FORWARDED_ALLOW_IPS` / `FORWARDED_ALLOW_IPS` 配置，并传给 uvicorn，支持宿主机 Nginx HTTPS 反代时正确处理代理头。
- 新增 `backend/.env.example`，提供非敏感本地联调和生产占位配置示例，不包含真实域名、密钥或数据库凭据。
- 补充 CORS preflight、允许/不允许 origin、Trusted Host 拒绝、root_path OpenAPI servers 和配置解析测试。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录浏览器联调、生产 CORS/Trusted Host、代理头和子路径部署策略。

### 进行中

- 等待总 agent 后续按需启动独立测试 agent 和代码审计 agent 复验本次部署配置修复。

### 阻塞与风险

- 当前未在真实 Nginx + HTTPS + 公网域名环境中做端到端验证；已通过 FastAPI TestClient 覆盖后端中间件行为，真实反代仍需部署环境补验 `Host`、`X-Forwarded-Proto`、路径重写和 TLS 终止配置。
- 若生产使用 `https://域名/xxx/api/v1/...` 子路径暴露后端，Nginx 必须与 `BACKEND_ROOT_PATH=/xxx` 保持一致；更推荐 API 仍暴露为 `/api/v1/...`，前端只在静态资源层使用 `/xxx/`。
- 生产必须显式配置 `BACKEND_CORS_ALLOWED_ORIGINS` 和 `BACKEND_TRUSTED_HOSTS`；默认值刻意保守，未配置真实域名时公网访问会被 Trusted Host 拦截。

### 下一步

- 由测试 agent 或部署验证任务在真实 Nginx 环境补跑 HTTPS 入口、子路径访问、OpenAPI server URL、登录 preflight 和受保护 API 请求。
- 后续安全任务继续补充限流、安全响应头、登录失败审计和项目级 RBAC。

### 验证

- 已运行 `uv run pytest tests/test_config.py tests/test_deployment_middleware.py`，结果：13 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：54 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format .`，结果：1 个文件被格式化，45 个文件未变更。
- 已运行 `uv run ruff format --check .`，结果：46 个文件已格式化。
- 已运行 `uv run mypy .`，结果：46 个源文件无类型错误。

## 2026-06-20 T-0017-fix 审计修复

### 已完成

- 修复审计 P2：在 Settings 配置层增加 CORS 组合校验，拒绝 `BACKEND_CORS_ALLOWED_ORIGINS=*` 与 `BACKEND_CORS_ALLOW_CREDENTIALS=true` 同时配置，避免 wildcard origin 与跨域凭据共用。
- 补充配置测试，覆盖环境变量显式配置 wildcard origin 且开启 credentials 时抛出 `ValidationError`。
- 修复审计 P3：更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md` 的子路径反代说明，明确公网 `/xxx/api/v1/...` 应由代理剥离或映射 `/xxx` 前缀后转发给后端 `/api/v1/...`，同时 ASGI 使用 `root_path=/xxx`。

### 阻塞与风险

- 当前仍未在真实 Nginx + HTTPS + 公网域名环境中做端到端验证；真实反代仍需部署环境补验 `Host`、`X-Forwarded-Proto`、路径重写、`root_path` 和 TLS 终止配置。

### 验证

- 已运行 `uv run pytest tests/test_config.py`，结果：9 个测试通过。
- 已运行 `uv run pytest`，结果：55 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format .`，结果：46 个文件未变更。
- 已运行 `uv run ruff format --check .`，结果：46 个文件已格式化。
- 已运行 `uv run mypy .`，结果：46 个源文件无类型错误。

## 2026-06-20 T-0020 项目级 RBAC 与团队角色后端基础

### 已完成

- 新增阶段 1 项目级 RBAC 基础模型和迁移：`rbac_teams`、`rbac_team_members`、`rbac_project_members`，项目角色覆盖 `viewer`、`editor`、`admin`。
- 新增 `PermissionService` 与 `SqlAlchemyPermissionRepository`，集中提供项目角色查询、角色层级判断、超级用户绕过和项目成员授权写入入口，避免权限逻辑散落在路由函数。
- 将项目、环境、服务管理 API 从“有效用户均可访问全部资源”收敛为项目级权限控制：超级用户可访问全部；普通用户只读自己有项目角色的资源；创建项目后创建者自动获得该项目 `admin`；创建环境/服务需要 `editor/admin`。
- 补充测试覆盖未授权用户无法读取他人项目、`viewer` 只能读不能创建环境/服务、`editor` 可创建环境/服务、创建者获得 `admin`、超级用户可管理、停用用户仍被 401 拒绝，以及权限 service 角色层级。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录新表、接口权限、403 错误码、验证结果和 MySQL 补验边界。
- 追加 `agents/runtime/backend-agent.log.md` 记录本次过程和待审计/合并请求摘要；该日志保持 ignored，不提交。

### 进行中

- 等待总 agent 后续启动测试 agent 和代码审计 agent，对本次 RBAC 基础做独立复验与审计。

### 阻塞与风险

- 当前 worktree 没有真实 MySQL 服务，本次只能用 SQLite 覆盖迁移升降级、外键/唯一约束映射和 API 行为；MySQL 外键名、索引、排序规则和事务行为仍需容器环境补验。
- 当前尚未开放团队管理、团队成员管理、项目成员授权 API 或审计日志；`rbac_teams`、`rbac_team_members` 和 `rbac_project_members` 是后续管理接口的数据基础。
- 当前管理 API 仍未分页；普通用户列表已按可访问项目过滤，但数据量上来前仍需补分页契约和测试。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 下一步

- 由测试 agent 在真实 MySQL 容器环境中补跑 `uv run alembic upgrade head`、`uv run alembic downgrade base`、RBAC 外键/唯一约束、项目越权拒绝和 API 集成验证。
- 后续权限管理任务补团队/成员管理 API、项目成员授权 API、审计日志和危险动作 `admin` 校验。

### 验证

- 已运行 `uv run pytest tests/test_management_api.py`，结果：36 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：61 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：52 个文件已格式化。
- 已运行 `uv run mypy .`，结果：52 个源文件无类型错误。
- 已使用 `sqlite:///./tmp-t0020-rbac.db` 运行 `uv run alembic -x database_url=sqlite:///./tmp-t0020-rbac.db upgrade head` 和 `uv run alembic -x database_url=sqlite:///./tmp-t0020-rbac.db downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。

## 2026-06-21 T-0020-fix Kierkegaard 审计修复

### 已完成

- 修复 P1：新增 repository 层事务辅助，`ManagementService.create_project()` 将项目创建和创建者 `rbac_project_members.admin` 授权放入同一事务边界；任一写入失败都会统一 rollback，避免留下无 owner/admin 项目。
- 修复 P2：服务创建先按 `(environment_id, project_id)` 查询环境；用户仅对请求项目有权限时，传入其他项目环境 ID 与传入不存在环境 ID 一样返回 `404 环境不存在`，避免通过 `404/409` 探测跨项目环境是否存在；对用户有权限的两个项目之间仍保留 `409` 归属不匹配业务错误。
- 补充回归测试：覆盖授权写入失败时项目创建回滚、跨项目无权限环境 ID 不泄露且不会创建服务。
- 更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md` 和 ignored 运行日志。

### 阻塞与风险

- 本次未修改 Alembic 迁移；未重跑 migration 升降级。事务与查询改动仍建议在真实 MySQL 容器中由测试 agent 复验。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 验证

- 已运行 `uv run pytest tests/test_management_api.py tests/test_permissions.py`，结果：39 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：63 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：53 个文件已格式化。
- 已运行 `uv run mypy .`，结果：53 个源文件无类型错误。

## 2026-06-21 T-0020-mysql-test-adopt

### 已完成

- 接手测试 agent Feynman 留下的真实 MySQL 回归测试补丁，范围限定在 `backend/tests/test_management_api.py`、后端 README、API 契约草案和 ignored 后端运行日志。
- 新增可选真实 MySQL 回归入口：设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 时，测试会创建随机 `telemetry_test_<uuid>` 临时库、执行 Alembic `upgrade head`，并复验项目创建授权失败整体回滚、跨项目 `environment_id` 不泄露且不创建服务。
- 确认默认未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 时相关用例 `skip`，不影响普通本地或 CI 的 `uv run pytest`。
- 小幅整理真实 MySQL 测试辅助代码：临时库和表名通过受控 MySQL 标识符校验/引用，清理阶段使用受控表清单并重置测试库数据，避免跨用例自增 ID 漂移。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录真实 MySQL 回归测试 env var、临时库行为和不得输出连接串/密码的安全边界。

### 阻塞与风险

- 本机 `C:\Users\q-lau\Documents\telemetry\auth.txt` 未发现可直接用于 SQLAlchemy 的 MySQL URL，本次未执行真实 MySQL 连接复验；真实 MySQL 路径仍需总 agent 或测试环境提供 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 后补跑。
- `uv run pytest` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 验证

- 已运行 `uv run pytest tests/test_management_api.py tests/test_permissions.py`，结果：39 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：63 个测试通过、2 个真实 MySQL 用例跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：53 个文件已格式化。
- 已运行 `uv run mypy .`，结果：53 个源文件无类型错误。

## 2026-06-21 T-0021 API Key 创建与撤销后端基础

### 已完成

- 新增 API Key 持久化模型、repository、service、schema 和路由：`api_keys` 表保存 `project_id`、`name`、`key_prefix`、`key_hash`、`status`、`created_by_user_id`、`created_at`、`revoked_at`、`last_used_at`。
- 新增 Alembic 迁移 `20260621_0004_create_api_keys.py`，包含 `api_keys` 表、项目/创建用户外键、`key_hash` 全局唯一约束和常用索引。
- 新增管理接口：`GET/POST /api/v1/projects/{project_id}/api-keys` 和 `POST /api/v1/projects/{project_id}/api-keys/{api_key_id}/revoke`。
- API Key 管理权限收敛为项目 `admin`；`viewer`、`editor` 被拒绝，superuser 可管理全部项目。
- API Key 明文只在创建响应的 `api_key` 字段返回一次；数据库和列表/撤销响应只保留哈希、展示前缀和元数据。
- 新增 `ApiKeyService.verify_key(raw_key)`，为后续摄入 API 鉴权提供项目上下文校验入口；撤销后返回 `None`。
- 补充 `backend/tests/test_api_keys.py`，覆盖明文不入库、hash 不等于明文、创建/列表/撤销响应字段、admin/superuser 权限、viewer/editor 拒绝、撤销后 verify 失败、缺失项目/无权限项目和 SQLite Alembic 升降级。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录新接口、权限、错误码、安全边界、迁移表和验证结果。
- 追加 ignored 运行日志 `agents/runtime/backend-agent.log.md`；不提交运行日志。

### 进行中

- 等待总 agent 后续按流程启动测试 agent 和代码审计 agent，对 API Key 后端基础做独立复验与审计。

### 阻塞与风险

- 当前 worktree 没有真实 MySQL 服务，本次仅完成 SQLite Alembic 升降级、SQLite API 测试和 repository/service 行为验证；MySQL 外键、唯一索引、字符集、排序规则和撤销事务行为仍需真实 MySQL 补验。
- 当前尚未实现摄入路由，仅提供 `ApiKeyService.verify_key(raw_key)` 作为后续摄入鉴权入口；摄入接口接入时还需补请求头契约、限流、审计日志和使用频率统计。
- 当前 API Key 使用 SHA-256 保存高熵随机 token 的哈希；后续如引入服务端 pepper/HMAC，应规划密钥轮换和兼容策略。
- 当前未引入 API Key 使用审计日志；创建和撤销操作后续应写入审计事件。

### 下一步

- 由测试 agent 在真实 MySQL 环境中补跑 `uv run alembic upgrade head`、`uv run alembic downgrade base`，并复验 API Key 外键、`key_hash` 唯一约束、撤销状态和权限拒绝。
- 后续摄入任务接入 `ApiKeyService.verify_key(raw_key)`，定义摄入请求头和无效/撤销 key 的错误码。
- 后续安全任务补 API Key 创建/撤销审计日志、速率限制、失败统计和可选 HMAC pepper 策略。

### 验证

- 已运行 `uv run pytest tests/test_api_keys.py`，结果：5 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。

## 2026-06-21 T-0021-fix Descartes 审计修复

### 已完成

- 修复 P2：`ApiKeyService` 不再对普通认证用户先查询真实项目存在性；普通用户未处于目标项目权限范围内时，API Key 列表、创建和撤销均统一返回 `404 项目不存在`，避免通过 `403/404` 枚举 `project_id`。
- 保留项目内角色不足语义：已拥有目标项目 `viewer` 或 `editor` 的用户仍会在 API Key 创建、列表和撤销时收到 `403 无项目权限`；superuser 仍可管理所有已存在项目。
- 补齐 P3 回归测试：`backend/tests/test_api_keys.py` 覆盖 viewer/editor 对 revoke API Key 被拒，以及陌生普通用户对列表、创建、撤销均无法区分项目不存在和无项目权限。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 API Key 管理端点的新错误边界和非枚举安全语义。
- 追加 ignored 运行日志 `agents/runtime/backend-agent.log.md`；不提交运行日志。

### 阻塞与风险

- 未发现测试 agent Confucius 在 `agents/runtime` 或 `backend/PROJECT_PROGRESS.md` 中留下 T-0021 API Key 真实 MySQL 复验结果；本任务不代跑其职责，真实 MySQL 对 API Key 外键、唯一索引、撤销状态和权限拒绝的复验仍保留为总 agent 后续测试边界。
- `uv run pytest tests/test_api_keys.py` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 验证

- 已运行 `uv run pytest tests/test_api_keys.py`，结果：5 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。

## 2026-06-21 T-0022 阶段 2 最小摄入 API 与 API Key 鉴权

### 已完成

- 新增最小事件摄入路由：`POST /api/v1/ingest/events` 和 `POST /api/v1/ingest/batch`。
- 摄入鉴权接入 `ApiKeyService.verify_key(raw_key)`，支持 `Authorization: Bearer <api_key>` 和 `X-API-Key`；两者同时存在时优先使用 `Authorization`。
- 新增 `ingest_records` ORM 模型、repository、service、schema 和 Alembic 迁移 `20260621_0005_create_ingest_records.py`。
- `ingest_records` 保存 `project_id`、`api_key_id`、`kind`、`event_type`、`source`、`payload` JSON、`occurred_at` 和 `received_at`；项目归属只来自 API Key 上下文。
- 请求校验限制事件类型、单事件 payload 64 KiB、批量最多 100 条、批量 payload 256 KiB，并禁止顶层额外字段。
- 补充 `backend/tests/test_ingest_api.py`，覆盖有效 API Key 上报并绑定项目、`X-API-Key`、缺失/无效/撤销 key 拒绝、payload `422`、顶层 `project_id` 不能覆盖归属、跨项目 payload 不影响归属、SQLite Alembic 升降级。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录接口、鉴权头、响应、错误码、安全边界、当前持久化边界和验证结果。
- 追加 ignored 运行日志 `agents/runtime/backend-agent.log.md`；不提交运行日志。

### 进行中

- 等待总 agent 后续按流程启动独立测试 agent 和代码审计 agent；本次后端开发 agent 已完成自测与文档记录。

### 阻塞与风险

- 当前 worktree 没有真实 MySQL 服务，本次仅完成 SQLite Alembic 升降级、SQLite API 测试和 SQLAlchemy 行为验证；MySQL 外键、JSON 字段、索引、字符集、排序规则和真实写入行为仍需设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 或专用 MySQL 环境后补验。
- 当前摄入 API 仅支持 events 最小 schema；metrics/logs/traces、ClickHouse/MongoDB 写入、限流、审计日志、摄入统计和查询/读取接口仍属后续阶段。
- 代码当前不输出请求体日志；后续若引入结构化日志，必须脱敏 `Authorization`、`X-API-Key`、API Key 明文和 payload 中可能存在的敏感字段。

### 下一步

- 由测试 agent 或真实 MySQL 环境补跑 `uv run alembic upgrade head`、`uv run alembic downgrade base`，并复验 `ingest_records` 外键、JSON payload 写入和撤销 API Key 后拒绝摄入。
- 后续阶段补充摄入限流、审计日志、摄入统计，以及 metrics/logs/traces 专用 schema 和 ClickHouse/MongoDB 存储策略。

### 验证

- 已运行 `uv run pytest tests/test_ingest_api.py`，结果：6 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：74 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：67 个文件已格式化。
- 已运行 `uv run mypy .`，结果：67 个源文件无类型错误。
- 已使用 `sqlite:///./tmp-t0022-ingest.db` 运行 `uv run alembic -x database_url=sqlite:///./tmp-t0022-ingest.db upgrade head` 和 `uv run alembic -x database_url=sqlite:///./tmp-t0022-ingest.db downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0023 阶段 2 metrics/logs 专用摄入 API 基础

### 已完成

- 新增 `POST /api/v1/ingest/metrics`，支持 `metrics` 数组批量摄入，字段覆盖 `name`、`value`、`timestamp`、`unit`、`type`、`tags`、`source` 和 `payload`。
- 新增 `POST /api/v1/ingest/logs`，支持 `logs` 数组批量摄入，字段覆盖 `level`、`message`、`timestamp`、`logger`、`source`、`trace_id`、`span_id`、`attributes` 和 `payload`。
- 复用 T-0022 的 API Key 鉴权依赖；项目归属仍只来自 API Key，上报顶层 `project_id` 被 Pydantic extra forbid 拒绝，嵌套 `payload`、`tags`、`attributes` 内同名字段仅作为业务载荷。
- 复用 `ingest_records` 最小持久化：events 使用 `kind=event`、metrics 使用 `kind=metric`、logs 使用 `kind=log`；metrics 的 `event_type` 映射为 metric name，logs 的 `event_type` 映射为 level。
- 增加 metrics/logs 校验：批量最多 100 条、整体 JSON 不超过 256 KiB；metrics `value`、`tags`、`payload` 拒绝 `NaN`/`Infinity`/`-Infinity`；logs `message` 最长 8192 字符，`attributes`、`payload` 拒绝非有限数值。
- 扩展 `backend/tests/test_ingest_api.py`，覆盖有效 metrics/logs 摄入、缺失/无效/撤销 API Key、payload validation、project binding、顶层 `project_id` 被拒绝、metrics value 和嵌套业务载荷非有限数值拒绝，并保持 events 测试通过。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 metrics/logs 摄入契约、持久化映射、安全边界和验证边界。
- 审计修复：metrics `value` 改为 strict numeric 校验，拒绝字符串和布尔值被 Pydantic 静默转换为数值，并补对应 `422` 回归测试；合法 int/float 仍可摄入，非有限数值仍被拒绝。

### 阻塞与风险

- Godel 已在真实 MySQL 临时库补验 migration head/downgrade、外键、JSON 字段、索引、metrics/logs 写入、撤销 API Key 后拒绝摄入和 validation；后续仍需在引入 ClickHouse/MongoDB/Redis 后补对应存储链路专项验证。
- 当前仍是最小摄入持久化，尚未实现限流、审计日志、摄入统计、读取/查询接口、traces schema 或 ClickHouse/MongoDB 等专用存储策略。
- 后续若引入结构化日志，必须继续脱敏 `Authorization`、`X-API-Key`、API Key 明文和 payload 中可能存在的敏感字段。

### 验证

- 已运行 `uv run pytest tests/test_ingest_api.py`，结果：20 个测试通过，1 条 FastAPI/Starlette TestClient 上游弃用警告；包含 metrics `value` 字符串/布尔值拒绝回归测试。
- 已运行 `uv run pytest`，结果：89 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：67 个文件已格式化。
- 已运行 `uv run mypy .`，结果：67 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0024 ClickHouse 初始化 SQL 与 Compose 挂载

### 已完成

- 新增 `docker/clickhouse/init/01-create-telemetry-tables.sql`，创建 ClickHouse `telemetry` 数据库和阶段 2 基础 MergeTree 表：`metric_samples`、`log_records`、`ingest_stats`，并预留 `trace_spans`。
- 更新项目根目录 `docker-compose.dev.yml`，在既有开发服务中为 ClickHouse 增加 init SQL 只读挂载到 `/docker-entrypoint-initdb.d/01-create-telemetry-tables.sql`，继续使用非默认本机端口映射。
- 更新 `.env.example`，补充 ClickHouse 本地开发占位配置；真实密码仍必须由环境变量或密钥管理注入，不提交真实凭据。
- 更新 `README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 ClickHouse 初始化表、compose 静态验证命令、验证边界和真实容器补验点。
- 新增 `tests/test_clickhouse_init.py`，静态确认 compose 配置可展开、init SQL 被挂载、SQL 包含预期表名和 MergeTree 引擎。

### 阻塞与风险

- 本次只做静态配置和 SQL 初始化脚本，不启动 ClickHouse 容器；真实容器中 entrypoint 执行、用户/库创建、端口连通、表存在性和后续 writer 字段映射仍需后续补验。
- MongoDB 初始化尚未实现；后续需要补 MongoDB compose 服务、初始化脚本或集合/index 约定，并与 ClickHouse 一起做真实容器回归。

### 验证

- 已运行 `docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet`，结果：通过。
- 已运行 `uv run pytest tests/test_clickhouse_init.py`，结果：2 个测试通过。
- 已运行 `uv run pytest`，结果：91 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：68 个文件已格式化。
- 已运行 `uv run mypy .`，结果：68 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0024 MongoDB events 集合初始化

### 已完成

- 更新根目录 `docker/mongodb/init-app-user.js`，在创建 MongoDB 应用读写用户后初始化 `events` 集合。
- 为 `events` 增加基础索引：项目/时间、项目/环境/服务/时间、事件类型/时间，以及可选 `expires_at` TTL 索引。
- 新增 `tests/test_mongodb_init.py`，静态确认 compose 配置可展开、MongoDB init 脚本被只读挂载、脚本包含预期集合和索引。
- 更新 `README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 MongoDB events 集合初始化、索引、验证边界和真实容器补验点。

### 阻塞与风险

- 本次只做静态初始化脚本和配置验证，不启动 MongoDB 容器；真实容器中 entrypoint 执行、应用用户登录、集合/索引存在性和后续 events writer 字段映射仍需后续补验。
- 暂未接入摄入写入 MongoDB，events 仍由当前 MySQL `ingest_records` 最小持久化链路兜底。

### 验证

- 已运行 `docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet`，结果：通过。
- 已运行 `uv run pytest tests/test_mongodb_init.py`，结果：2 个测试通过。
- 已运行 `uv run pytest`，结果：93 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：69 个文件已格式化。
- 已运行 `uv run mypy .`，结果：69 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。
