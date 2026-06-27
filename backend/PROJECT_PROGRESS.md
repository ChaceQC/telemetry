# 后端项目进度记录

本文件由后端开发 agent 维护。总 agent 会定时探测本文件，并将新增进展合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 2026-06-27 T-0085 告警周期评估状态持久化审计修复

### 复审剩余 P3 修复

- 补充 `run-due` 文档契约：disabled 收敛写入是 `next_evaluate_at` 之外的强制 due/write 例外；disabled 且已有当前状态、旧状态非 `disabled` 会立即更新为 `disabled`，计入 `evaluated_count` / `updated_state_count`，响应 `due=true`。
- 明确 disabled 边界：disabled 且无状态仍不创建新状态；已是 `disabled` 且 schedule 未到期只计入 skipped，响应 `due=false`。
- 本次只更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md` 和本进度文件，未改业务代码。

### 已完成

- 修复 Newton 审计提出的 disabled 周期路径：run-due 现在会扫描所有 enabled 规则，以及已经存在当前状态的 disabled 规则；已有 `firing/ok/no_data/error` 状态的规则被禁用后，下次 run-due 会更新为 `disabled`，禁用且没有状态的规则仍不创建新状态。
- 修复 error 状态写入语义：非 metrics 或执行语义错误只更新 `status/last_error/last_evaluated_at/next_evaluate_at`，保留之前最近一次成功评估的 `last_result`。
- 补强并发创建状态兜底：repository 在 `rule_id` 唯一约束冲突后 rollback、重新读取并复查 due；若另一轮已写入同状态且未到期，本轮按 skipped 返回，避免重复写入和 500。
- 将缺失 `next_evaluate_at` 的 due 语义统一为：有 `last_evaluated_at` 时按 `last_evaluated_at + evaluation.interval_seconds` 计算；两者都缺失才视为 due。
- 扩展 `backend/tests/test_alert_rules_api.py`，覆盖已有 firing 状态禁用后更新为 disabled、error 保留上次成功 `last_result`、缺失 `next_evaluate_at` fallback 语义、首次并发创建唯一约束冲突后的 rollback/re-fetch/recheck。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，同步 API-0027 的 disabled、error、due fallback 和并发冲突兜底语义。

### 阻塞与风险

- 本轮未启动 Docker，未读取或输出真实密钥，未连接真实 MySQL/ClickHouse/MongoDB/Redis；真实 MySQL 下的并发锁等待、事务隔离和 JSON 列读写仍需后续专项补验。
- 当前方案是 repository 层保守冲突兜底和复查，不实现跨进程分布式 claim、后台 scheduler、通知、告警历史、恢复事件、静默/抑制、Webhook、前端 UI 或 events 自动写入。

### 验证

- 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：45 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_alert_rules_api.py -k "due_evaluation or migration or ddl" -q`，结果：8 个测试通过、37 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-NoUtf8Bom.ps1`，结果：通过，`No tracked files start with a UTF-8 BOM.`。
- 已运行 `uv run alembic heads`，结果：通过，当前 head 为 `20260627_0011`。
- 已运行 `uv run ruff check app/repositories/alerts.py app/services/alerts.py tests/test_alert_rules_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/repositories/alerts.py app/services/alerts.py tests/test_alert_rules_api.py`，结果：3 个文件已符合格式。
- 已运行 `uv run mypy app/repositories/alerts.py app/services/alerts.py tests/test_alert_rules_api.py`，结果：通过。
- 已运行 `uv run ruff check .`，结果：通过，`All checks passed!`。
- 已运行 `uv run ruff format --check .`，结果：通过，96 个文件已符合格式。
- 已运行 `uv run mypy .`，结果：通过，96 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过，lock 未变。
- 已运行 `git diff --check`，结果：通过。
- 复审 P3 文档修复后，已运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-NoUtf8Bom.ps1`，结果：通过，`No tracked files start with a UTF-8 BOM.`。
- 复审 P3 文档修复后，已运行 `git diff --check`，结果：通过。

### 下一步

- 提交并推送到 `origin/feature/backend-dev`。
- 推送后由总 agent 读取 GitHub Actions run 并触发复审。

## 2026-06-27 T-0085 告警周期评估状态持久化后端骨架

### 已完成

- 在后端独立 worktree `C:\Users\q-lau\Documents\telemetry-worktrees\backend` 的 `feature/backend-dev` 分支继续 T-0085；确认本轮不再写入根工作树。
- 新增 `alert_evaluation_states` SQLAlchemy model 和 Alembic 迁移 `20260627_0011_create_alert_evaluation_states.py`，每条告警规则最多一条当前状态，保存 `status`、`last_evaluated_at`、`next_evaluate_at`、`last_result`、`last_error` 和更新时间；MySQL/MariaDB 下 `last_result` 使用 JSON 列。
- 新增 `POST /api/v1/alerts/evaluations/run-due`，无请求体，仅超级用户可触发一次 enabled 规则 due 扫描；当前不实现 `limit` / `project_id` 可选参数。
- due 判断按状态表 `next_evaluate_at` 执行：缺少状态、缺少 `next_evaluate_at` 或 `next_evaluate_at <= checked_at` 视为 due；未到期规则返回 skipped item 且不更新状态。
- due 规则复用 T-0084 / API-0026 的 metrics 阈值评估语义，成功持久化 `firing/ok/no_data`、`last_result` 和下一次评估时间；非 metrics 或不满足 API-0026 执行条件的 enabled 规则持久化 `error` 和 `last_error`。
- 响应返回 `checked_at`、`evaluated_count`、`skipped_count`、`created_state_count`、`updated_state_count` 和 `items[]`，每项包含规则 ID、项目、旧/新状态、是否 due、下一次评估时间和错误摘要。
- 扩展 `backend/tests/test_alert_rules_api.py` 覆盖 run-due 创建状态、后续未到期跳过、非 metrics 规则写入 `error`、非超级用户 `403`、SQLite 迁移升降级和 MySQL DDL 编译。
- 已更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 API-0027、状态表、迁移和当前不做 scheduler/通知/历史/恢复/静默/Webhook/前端 UI/ClickHouse/MongoDB/Redis 的边界。
- 后端版本保持 `0.5.0`，本小步不改 `backend/VERSION`。

### 阻塞与风险

- Feynman 测试子 agent 已完成独立复验，初始结论为未通过：`uv run mypy .` 在 `tests/test_alert_rules_api.py` 中发现 `last_result` 可空后直接索引的类型问题；开发侧已修复为先断言非空再索引，待重新执行完整最低验证确认关闭。
- 本轮不启动 Docker，不连接真实 MySQL/ClickHouse/MongoDB/Redis；真实 MySQL 下 `alert_evaluation_states` 迁移、JSON 列读写、唯一约束和外键级联仍需后续专项补验。
- 不实现后台常驻 scheduler、通知渠道、告警历史、恢复事件、静默/抑制、Webhook、前端 UI、ClickHouse/MongoDB/Redis 链路或 events 自动写入。
- 测试过程中曾出现本地 SQLite 文件 `backend/telemetry-dev.db`；Feynman 已确认该文件由本次 TestClient 探针产生并删除，开发侧复查该路径已不存在，未删除其他资源。

### 验证

- 已运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-NoUtf8Bom.ps1`，结果：通过，`No tracked files start with a UTF-8 BOM.`。
- 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：41 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行迁移/schema 相关筛选 `uv run pytest tests/test_alert_rules_api.py -k "migration or ddl or due_evaluation" -q`，结果：5 个测试通过、36 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run alembic heads`，结果：通过，当前 head 为 `20260627_0011`。
- 已运行 `uv run ruff check .`，结果：通过，`All checks passed!`。
- 已运行 `uv run ruff format --check .`，结果：通过，`96 files already formatted`。
- 已运行 `uv run mypy .`，结果：通过，96 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过，lock 未变。
- 已运行 `git diff --check`，结果：通过。

### 测试 agent 独立复验

- 已启动测试 agent `Feynman`（思考强度 xhigh）对 T-0085 后端状态评估骨架做独立复验。
- 初始复验命令中 `uv run pytest tests/test_alert_rules_api.py -q` 通过，结果：41 passed，1 warning；`uv run ruff format --check .`、`uv run ruff check .`、`uv run alembic heads`、OpenAPI 路径探针、`uv lock --check` 和 `git diff --check -- backend` 通过。
- 初始复验的唯一阻断为 `uv run mypy .` 失败，原因是测试中 `last_result` 类型为 `dict[str, Any] | None` 时直接索引；已由开发侧修复，并通过最终 `uv run mypy .` 确认关闭。
- `Feynman` 未启动 Docker、真实 MySQL、后端服务、前端或浏览器；它产生的 `backend/telemetry-dev.db` 已删除。

### 下一步

- 检查状态、敏感文件、锁文件和 BOM guard 后，提交 `feat: 增加告警状态评估骨架` 并推送到 `origin/feature/backend-dev`。
- 推送后由总 agent 读取对应 GitHub Actions run、汇总根进度并启动代码审计 agent。

## 2026-06-27 T-0084-format 后端 Ruff format 门禁修复

### 已完成

- 在后端独立 worktree `C:\Users\q-lau\Documents\telemetry-worktrees\backend` 的 `feature/backend-dev` 分支上，已 fetch `origin` 并将当前分支 fast-forward 同步到 `origin/dev` 的 T-0084 收口提交 `bfbb463`。
- 针对 GitHub Actions run `28283450319` 的 `uv run ruff format --check .` 失败，仅运行 Ruff formatter 处理 `backend/app/core/config.py` 和 `backend/tests/test_config.py`。
- 实际变更为移除上述两个 Python 文件开头的 UTF-8 BOM，未改业务语义、配置值、测试断言或 API 契约。
- 根据总 agent 后续决策扩大本格式化修复小步范围，额外移除 `backend/pyproject.toml` 开头 UTF-8 BOM；原因是该 BOM 会阻塞 pytest/TOML 配置解析和 CI 后续验证门禁，且不改业务语义。
- `backend/README.md` 无实质行为变化，无需更新；未启动 Docker、后端服务、数据库、前端或浏览器，未读取 `auth.txt`。

### 阻塞与风险

- pytest/TOML 配置解析阻塞已通过移除 `backend/pyproject.toml` BOM 关闭，并已用 `uv run pytest tests/test_config.py -q` 复验通过。
- 本轮只修复格式化门禁；不改变 T-0084 告警评估行为，也不扩大测试矩阵到真实 MySQL、ClickHouse、MongoDB 或 Redis。

### 验证

- 已运行 `uv run ruff format --check app/core/config.py tests/test_config.py`，结果：通过，`2 files already formatted`。
- 已运行 `uv run ruff check app/core/config.py tests/test_config.py`，结果：通过，`All checks passed!`。
- 已运行 `uv run pytest tests/test_config.py -q`，结果：未进入测试用例，因 `backend/pyproject.toml` 第 1 字符 BOM 导致配置解析失败：`Invalid statement (at line 1, column 1)`。
- 已运行 `git diff --check`，结果：通过。
- 已补充运行 `uv run ruff format --check .`，结果：通过，`95 files already formatted`。
- 已补充运行 `uv run ruff check .`，结果：通过，`All checks passed!`。
- 移除 `backend/pyproject.toml` BOM 后已重新运行 `uv run ruff format --check .`，结果：通过，`95 files already formatted`。
- 移除 `backend/pyproject.toml` BOM 后已重新运行 `uv run ruff check .`，结果：通过，`All checks passed!`。
- 移除 `backend/pyproject.toml` BOM 后已重新运行 `uv run pytest tests/test_config.py -q`，结果：13 个测试通过。
- 移除 `backend/pyproject.toml` BOM 后已重新运行 `git diff --check`，结果：通过。

### 下一步

- 提交 `style: 修复后端UTF-8 BOM格式门禁` 并推送到 `origin/feature/backend-dev`。
- 由总 agent 后续读取对应 GitHub Actions run，并将结果合并到正式沟通板和根进度。

## 2026-06-27 T-0084 指标阈值告警评估后端基础

### 已完成

- 新增 `POST /api/v1/projects/{project_id}/alerts/rules/{rule_id}/evaluate`，无请求体，读取已保存告警规则并按项目 `viewer` 权限执行一次性手动评估；无项目成员关系、项目不存在和跨项目 rule ID 沿用隐藏式 `404` 语义。
- 当前仅支持 `signal="metrics"`；非 metrics 返回 `422`。metrics condition 执行时规范化并校验 `metric/source/operator/threshold/aggregation`，其中 `threshold` 必须是有限 JSON number，拒绝 bool 和字符串数字；`aggregation` 默认 `avg`，支持 `avg/sum/min/max/count`。
- 新增内部单窗口指标聚合辅助 `SqlAlchemyQueryRepository.aggregate_metric_window()`，按 `project_id`、`ingest_records.event_type=condition.metric`、可选 `source` 和 `[checked_at-window_seconds, checked_at]` 闭区间查询 `kind=metric` 样本，不改变既有 `/api/v1/query/metrics/aggregate` 分桶行为。
- 响应返回 `firing/ok/no_data/disabled` 状态、UTC `checked_at`、窗口、规范化 condition、observed 聚合值/sample_count/unit 和 message；禁用规则短路返回 `disabled` 且不查询指标样本。
- 扩展 `backend/tests/test_alert_rules_api.py` 覆盖 firing、ok、no_data、disabled、非 metrics 422、非法 condition 422、权限/404 隐藏，以及 viewer 可评估但不能写入的既有边界。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 API-0026 手动评估契约、metric name 使用 `ingest_records.event_type` 的实现事实和当前不做后台 scheduler/通知/历史/持久状态/前端 UI 的边界。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮不启动 Docker，不接真实 MySQL/ClickHouse/MongoDB/Redis；真实 MySQL 下 alert_rules JSON 列读写、单窗口指标聚合执行计划和评估 API 仍需后续专项补验。
- 当前只提供同步手动评估，不做后台调度、周期执行、状态持久化、通知、告警历史、恢复事件、前端 UI 或 events 自动写入。

### 开发侧验证

- 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：37 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行改动文件 `ruff check`、`ruff format --check` 和 `mypy` 专项，结果均通过。
- 后续提交前将继续运行更宽范围相关测试、全量静态检查、`uv lock --check` 和 `git diff --check`。

## 2026-06-27 T-0084 指标阈值告警评估 P2 兜底修复

### 已完成

- 修复 `app/services/alerts.py` 中 `condition.threshold` 规范化路径对超大 JSON integer 的 `float()` 转换溢出兜底，统一映射为 `AlertRuleEvaluationError("condition.threshold 必须是有限 JSON number")`，避免评估接口泄漏为 `500`。
- 扩展 `backend/tests/test_alert_rules_api.py` 增加回归测试，覆盖 `threshold=int("9" * 309)` 的 metrics rule 评估请求，确认返回 `422` 且 `detail` 与服务层错误信息一致。

### 阻塞与风险

- 暂无新增阻塞；仅为评估规范化补强，未改变保存层 JSON 校验或告警评估语义。

### 开发侧验证

- 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：38 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/services/alerts.py tests/test_alert_rules_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/services/alerts.py tests/test_alert_rules_api.py`，结果：2 个文件已符合格式。
- 已运行 `uv run mypy app/services/alerts.py tests/test_alert_rules_api.py`，结果：通过。
- 已运行 `uv lock --check`，结果：通过，lock 未变。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-26 T-0081 告警规则 CRUD 后端基础

### 已完成

- 新增 `alert_rules` SQLAlchemy model 和 Alembic 迁移 `20260626_0010_create_alert_rules.py`，保存项目告警规则 `name/description/enabled/severity/signal/condition/evaluation` 与创建/更新审计字段；MySQL/MariaDB 使用 JSON 列，SQLite 走 SQLAlchemy JSON 兼容类型。
- 新增 `app/schemas/alerts.py`、`app/repositories/alerts.py`、`app/services/alerts.py` 和 `app/api/routes/alerts.py`，并在 `api/dependencies.py`、`api/router.py`、`models/__init__.py`、`migrations/env.py` 接入。
- 提供 `GET /api/v1/alerts/rules`、`POST /api/v1/alerts/rules`、`GET/PATCH/DELETE /api/v1/projects/{project_id}/alerts/rules/{rule_id}`。
- 权限语义按 API-0025：viewer 可读，editor 可写；普通用户无项目成员关系和不存在项目隐藏为 `404 项目不存在`；跨项目 rule ID 隐藏为 `404 告警规则不存在`；viewer 写入返回 `403 无项目权限`；同项目规则名称重复返回 `409`。
- 保存层校验覆盖 `severity`、`signal`、`condition`、`evaluation`、空 patch、分页参数等 `422` 边界；`condition/evaluation` 限制为非空 JSON 对象、16 KiB、深度 16、1024 节点且拒绝非有限数；`evaluation` 要求 `window_seconds` 和 `interval_seconds` 为 `1..86400` 的整数。
- 新增 `backend/tests/test_alert_rules_api.py` 覆盖成功路径、权限边界、隐藏式 404、viewer 写 403、重复名称 409、非法字段/枚举/JSON/空 patch/分页过滤、repository 缺失项目/重复名称映射、SQLite 迁移升降级和 MySQL JSON DDL 元数据。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 Alert Rules API、迁移、实现位置和当前只保存/读取规则的边界。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮不实现规则评估、后台调度、通知、告警历史、静默/恢复、Webhook、前端 UI 或 ClickHouse/MongoDB/Redis 后台链路。
- 未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL `alert_rules` JSON 列读写、唯一约束和 API CRUD 执行路径仍需后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：25 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_alert_rules_api.py tests/test_config.py -q`，结果：38 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_alert_rules_api.py tests/test_dashboard_api.py tests/test_config.py -q`，结果：182 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest -q`，结果：342 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/models/alerts.py app/schemas/alerts.py app/repositories/alerts.py app/services/alerts.py app/api/routes/alerts.py tests/test_alert_rules_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/models/alerts.py app/schemas/alerts.py app/repositories/alerts.py app/services/alerts.py app/api/routes/alerts.py tests/test_alert_rules_api.py`，结果：6 个文件已符合格式。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：95 个文件已符合格式。
- 已运行 `uv run mypy .`，结果：95 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过，lock 未变。
- 已运行 `git diff --check`，结果：通过。

### 测试 agent 独立复验

- 已启动测试 agent `Mencius`（思考强度 xhigh）对 T-0081 后端告警规则 CRUD 做独立复验；结论：通过，未发现需要开发 agent 修复的问题。
- `Mencius` 已运行 `uv run pytest tests/test_alert_rules_api.py -q`，结果：25 个测试通过。
- `Mencius` 已运行 `uv run pytest tests/test_alert_rules_api.py tests/test_dashboard_api.py tests/test_config.py -q`，结果：182 个测试通过。
- `Mencius` 已运行相关告警文件 `ruff check`、`ruff format --check`、`mypy`、`uv lock --check` 和 `git diff --check`，结果均通过。
- `Mencius` 额外执行 TestClient 探针，覆盖更新重名 `409`、无效分页/项目参数 `422`、无成员/缺失项目 `404`、跨项目 rule `404`、viewer 删除 `403` 和 OpenAPI 路径注册，结果通过。
- 未启动 Docker，未连接真实 MySQL，未创建临时库；本轮使用 SQLite/TestClient、SQLite 迁移测试和 MySQL DDL 编译覆盖。既有 Starlette TestClient/httpx deprecation warning 不影响本次结论。

## 2026-06-25 T-0078 Dashboard JSON 导入导出后端基础

### 已完成

- 新增 `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/export`，按已保存 dashboard 读取权限导出单个可移植 JSON 文档。
- 导出文档固定包含公开字段 `schema=telemetry.dashboard`、`version=1`、`name`、`description`、`layout`、`config`，其中 `version` 现在是严格整数 `1`，不接受字符串、浮点数或布尔值；文档不包含数据库 `id`、`project_id`、创建/更新用户或创建/更新时间等实例字段。
- 新增 `POST /api/v1/projects/{project_id}/dashboards/import`，请求体为 `document` 加可选顶层 `name/description` 覆盖，未覆盖时使用文档内名称和描述。
- 导入在路径项目下创建普通 dashboard，复用现有 dashboard 创建权限语义：目标项目至少 `editor`，`viewer` 返回 `403 无项目权限`，普通用户无项目成员关系或项目不存在返回 `404 项目不存在`。
- 导入文档通过 `DashboardExportDocument` 校验公开字段 `schema/version`、必填字段、禁止实例字段，并复用现有 `DashboardCreate` 的 JSON 大小/深度/复杂度/finite-number、panel、time_range 和 variables 校验。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖导出成功/权限/实例字段排除、导入成功/覆盖/普通 dashboard 后续可编辑、权限隐藏、非法 schema/version、缺字段、实例字段注入、非法 panel/time_range/variables、超大/过深/过复杂/NaN/Infinity，并新增回归测试显式拒绝 `schema_name`、字符串 `version` 和布尔 `version`。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录导入/导出 API 路径、请求/响应、权限、错误语义和当前不做前端 UI、批量导入、模板市场、分享/只读、文件上传存储、跨项目权限提升、覆盖已有 dashboard、ClickHouse 数据导出或告警。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard JSON 列读写、真实后端 HTTP 和前端导入导出 UI 联调仍需后续专项补验。
- 当前只支持单个 dashboard JSON 文档通过请求体导入；不做文件上传存储、批量导入、覆盖已有 dashboard、模板市场、分享/只读、跨项目权限提升、ClickHouse 数据导出或告警。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：157 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：157 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：88 个文件已符合格式。
- 已运行 `uv run mypy .`，结果：88 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。
- 2026-06-26 已补推 `feature/backend-dev` 到 `0728fc1` 并与 `origin/feature/backend-dev` 一致；随后 `dev` 文档同步提交 `5f2c8d0` 触发 GitHub Actions run `28228008679`，Backend checks 与 Frontend checks 均为 success；严格 `./scripts/Test-AgentWorktreeState.ps1` 通过，三棵 worktree 干净且本地/远端一致。
- 2026-06-26 收口记录提交 `2fd3790` 已推送到 `dev`，GitHub Actions run `28229682668` 通过，Backend checks 与 Frontend checks 均为 success。

### 测试 agent 独立复验

- 已启动测试 agent `Bacon`（思考强度 xhigh）对 T-0078 后端导入导出专项做独立复验；已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`、`uv run ruff check app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py tests/test_dashboard_api.py`、`uv run ruff format --check app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py tests/test_dashboard_api.py`、`uv run mypy app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py tests/test_dashboard_api.py`、`uv lock --check` 和 `git diff --check`，结果均通过；核心结论通过。未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器，真实 MySQL/dashboard JSON 列读写和真实 HTTP/UI 联调留待后续专项补验。

## 2026-06-25 T-0075 Dashboard 内置模板后端基础

### 已完成

- 新增内置 dashboard template 后端基础，提供 `GET /api/v1/dashboard-templates`、`GET /api/v1/dashboard-templates/{template_id}` 和 `POST /api/v1/projects/{project_id}/dashboard-templates/{template_id}/dashboards`。
- 内置 `service-overview`（服务总览）模板，使用既有 `config.panels`、`config.time_range`、`config.variables` schema，包含 metrics/logs/traces/topology 四类最小 panel，query 字段仅使用当前 panel preview/query 白名单可接受的顶层字段和完整 `${变量名}` 模板。
- 从模板创建 dashboard 复用现有 dashboard 创建权限语义：目标项目至少 `editor`，普通用户无项目成员关系或项目不存在仍按 `404 项目不存在` 隐藏，`viewer` 返回 `403 无项目权限`；创建后持久化为普通 dashboard，继续复用现有 CRUD/RBAC、preview 和 JSON/schema 校验。
- 模板创建请求体仅允许可选 `name`、`description`，不接受客户端传入 `project_id`、`layout`、`config` 等未声明字段，避免覆盖路径项目或注入模板外 config。
- 内置模板读取时会深拷贝 `layout/config` 并通过 `DashboardCreate` 保存层 schema 校验，避免多次读取或创建共享可变 config 引用。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖模板列表/读取、未知模板 `404`、从模板创建后可读取和 preview、权限隐藏、请求体注入 `422`、模板 config 保存层校验和深拷贝边界。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录模板 API、服务总览模板内容、权限/错误语义、防注入边界和当前不包含模板市场/导入导出/分享只读/真实 ClickHouse 查询等范围。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard templates 创建/读取、JSON 列读写和前端模板入口联调仍需后续专项补验。
- 当前仅提供内置服务总览模板和从模板创建普通 dashboard，不做前端模板 UI、模板市场、JSON 导入导出、分享/只读模式、告警态势真实数据或 ClickHouse 查询。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：123 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py app/services/dashboard_templates.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py app/services/dashboard_templates.py tests/test_dashboard_api.py`，结果：5 个文件已符合格式。
- 已运行 `uv run mypy app/api/routes/dashboard.py app/schemas/dashboard.py app/services/dashboard.py app/services/dashboard_templates.py tests/test_dashboard_api.py`，结果：5 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0070 Dashboard panel preview 请求时变量覆盖后端基础

### 已完成

- `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview` 新增可选 query 参数 `variables`，使用 JSON 对象字符串承载本次 preview 的一次性变量覆盖值；保持 GET 接口兼容，不引入请求体。
- preview 执行前会先读取已保存 dashboard/panel，再解析 `variables`；覆盖值只用于本次执行，优先级高于已保存 `config.variables[].default`，响应体 `query` 仍返回已保存 panel 的原始模板 query，不回写 dashboard config。
- 覆盖值按已保存 `config.variables` 校验：`text/select` 必须是字符串，`select` 必须匹配 options；`number` 必须是有限数字且不能是 bool；未知覆盖变量、非法 JSON、非对象覆盖、缺 default 且无覆盖、模板语法非法、覆盖值类型不符或替换后不满足既有 query 白名单校验均返回 `422`。
- 变量替换边界保持保守：仅支持 panel query 顶层字段值完整匹配 `${变量名}`；不支持部分字符串拼接、数组/对象深层模板、表达式、用户会话级变量状态或保存覆盖值。
- 保持 panel 显式 `occurred_from` / `occurred_to` 与 dashboard `config.time_range` 的优先级：请求时变量覆盖解析出的显式时间边界仍优先于 dashboard 全局时间范围。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖覆盖值优先于 default、无 default 但有覆盖、select/number 类型边界、未知变量/非法 JSON/非法类型 `422`、替换后 query 校验 `422`、响应 query 保持原始模板，以及 time range 显式变量覆盖优先于 dashboard time range。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 GET `variables` 参数、变量替换优先级、错误语义和当前边界；本轮不新增 API 路径、不变更响应模型、存储结构或部署依赖。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard panel preview 执行计划和前端变量控件联调仍需后续专项补验。
- 当前只支持 GET query 参数里的 JSON 对象覆盖；URL 长度、复杂变量状态、未保存草稿 config、深层模板、表达式、模板 dashboard、导入导出、自动刷新、告警和 ClickHouse 查询均不在本轮范围内。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：113 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：2 个文件已符合格式。
- 已运行 `uv run mypy app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：2 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0068 Dashboard panel preview 变量默认值替换后端基础

### 已完成

- `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview` 现在会在执行已保存 panel query 前读取已保存 dashboard `config.variables`，并仅对 panel `query` 顶层字段中完整匹配 `${变量名}` 的字符串做变量 default 替换。
- 支持 `text`、`select`、`number` 变量 default：`text/select` 替换后保持字符串，`number` 替换后保持数字，再进入既有 query 白名单校验和 preview 执行路径。
- 未知变量、变量无 `default`、模板语法非法、替换后类型不满足现有 query 校验时均沿既有 preview 错误路径返回 `422`，避免历史/损坏配置形成 `500`。
- 保持已保存 panel `query` 响应为原始模板值，不回写替换结果，不修改 dashboard 保存契约；不支持请求时变量覆盖、部分字符串拼接替换或数组/对象深层模板替换。
- 保持 panel 显式 `occurred_from` / `occurred_to` 与 dashboard `config.time_range` 的既有优先级语义：变量替换后再进入现有 query/time range 处理，因此显式时间变量 default 仍优先于 dashboard 全局时间范围。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖 text/select/number default 驱动真实 preview 查询、原始 query 响应不变、变量时间 default 覆盖 dashboard time range、未知变量/缺 default/非法模板/替换后类型非法 `422`，以及深层模板不替换。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 preview 变量默认值替换契约和边界；本轮不新增 API 路径、不变更响应模型、存储结构或部署依赖。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard panel preview 执行计划和前端变量控件联调仍需后续专项补验。
- 当前只支持顶层字段完整模板替换；复杂 DSL、请求时变量覆盖、数组/对象深层模板、模板 dashboard、导入导出、自动刷新、告警和 ClickHouse 查询均不在本轮范围内。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：87 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：100 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：2 个文件已符合格式。
- 已运行 `uv run mypy app/api/routes/dashboard.py tests/test_dashboard_api.py`，结果：2 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0066 Dashboard 变量配置后端基础

### 已完成

- 在 dashboard 保存层 `config` 校验中新增顶层 `variables` 最小 schema：仅当 `config` 是对象且包含 `variables` 时生效，数组 config 和没有 `variables` 的 legacy config 仍保持兼容。
- 支持变量对象基础字段 `name`、`label`、`type`、`default`、`options`；`name` 要求 1 到 64 字符，只能包含字母、数字、下划线且不能以数字开头，按裁剪后值保存并用于重复判断。
- `type` 限定为 `text`、`number`、`select`：`text` 可选字符串 `default` 且不接受 `options`；`number` 可选有限数字 `default` 且不接受 `options`；`select` 必须提供非空字符串数组 `options`，选项裁剪后不能为空且不能重复，可选 `default` 必须命中一个 option。
- 变量相关字符串字段会裁剪首尾空白后写回保存结果，包括 `name/label/type/default/options`；重复 `name` 和重复 option 均按规范化值判断。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖合法变量 create/update、字符串规范化、legacy 缺省兼容、重复 name、非法 name/type/options/default 等 create/update `422` 边界。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 `config.variables` 保存契约和当前边界；后端版本保持 `0.2.12`，本轮不新增 API 路径、不变更响应模型、存储结构或部署依赖。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮只做已保存 dashboard `config.variables` 的后端保存校验与规范化；不改前端 UI，不执行变量替换，不改 panel preview 查询语义，不新增 panel preview 请求参数，不接 ClickHouse，不做模板、自动刷新或告警。
- 未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实数据库 JSON 列读写和后续前端变量控件消费仍需后续专项补验。
- 本轮未启动测试子 agent；开发侧按任务期望完成相关后端自测和全量静态门禁，例外原因是当前改动集中在保存层 schema 与 API 单元测试，未涉及真实服务/数据库进程。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：83 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：96 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check`，结果：通过。
- 已运行 `uv run ruff format --check`，结果：87 个文件已符合格式。
- 已运行 `uv run mypy`，结果：87 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0064 Dashboard panel preview 继承全局时间范围

### 已完成

- `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview` 现在会读取已保存 dashboard `config.time_range`，并在 panel query 未显式设置对应时间边界时转换为 query service 使用的 `occurred_from` / `occurred_to`。
- 支持保存层既有 `relative` 范围 `15m/1h/6h/24h/7d`，基于服务端当前 UTC 时间生成 `[now - relative, now]` 查询范围；测试中通过 monkeypatch `_preview_now()` 固定当前时间，避免 flaky。
- 支持保存层既有 `absolute` 范围 `from/to`，按 ISO 8601 字符串解析后传入 query service；历史/非法形状的 dashboard `time_range` 在 preview 阶段按旧行为忽略，不影响 legacy config。
- panel query 显式 `occurred_from` / `occurred_to` 分别优先于 dashboard 全局范围，支持单边覆盖：例如 panel 只显式 `occurred_from` 时，`occurred_to` 仍可继承 dashboard 全局 `to`。
- 扩展 `backend/tests/test_dashboard_api.py`：原有 metrics/logs/events/traces/topology preview 成功路径现在包含 dashboard absolute 全局时间范围，并通过范围外样本证明真实 query 结果被过滤；新增 relative 全局时间范围固定 now 测试；新增 panel 单边显式时间优先测试；legacy/no panels/无 `time_range` 的既有隐藏或旧行为保持不变。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 panel preview 继承 `config.time_range` 的请求/响应不变、优先级和当前边界。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮只在已保存 dashboard panel preview 后端基础中补齐全局时间范围继承；不改前端请求，不新增请求参数，不改 `DashboardPanelPreviewResponse` 响应模型，不接 ClickHouse，不做变量、模板、自动刷新或告警。
- 未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard panel preview 执行计划和前端消费仍需后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：59 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check`，结果：通过。
- 已运行 `uv run ruff format --check`，结果：87 个文件已符合格式。
- 已运行 `uv run mypy`，结果：87 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0062 Dashboard 全局时间范围后端基础

### 已完成

- 在 dashboard 保存层 `config` 校验中新增顶层 `time_range` 最小 schema：仅当 `config` 是对象且包含 `time_range` 时生效，数组 config 和没有 `time_range` 的 legacy config 仍保持兼容。
- 支持相对时间范围 `{"mode":"relative","relative":"15m|1h|6h|24h|7d"}`，对 `mode/relative` 裁剪首尾空白并按裁剪后字符串保存。
- 支持绝对时间范围 `{"mode":"absolute","from":"ISO 8601","to":"ISO 8601"}`，对 `mode/from/to` 裁剪首尾空白并保留裁剪后的原始字符串；校验 `from/to` 可解析且可比较为 ISO 8601 时间，并要求 `from < to`。
- 拒绝对象以外的 `time_range`、未知或空 `mode`、缺失字段、非字符串或空字符串、未知相对范围、绝对时间不可解析、aware/naive 混用导致不可比较以及 `from >= to`。
- 扩展 `backend/tests/test_dashboard_api.py` 覆盖 create/update 保存相对和绝对 time range、首尾空白规范化、legacy config 兼容，以及非法 time range 在 create/update 均返回 `422`。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 `config.time_range` 保存契约、规范化策略、错误边界，以及 panel preview 不自动继承全局时间范围。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮只做已保存 dashboard `config.time_range` 的后端保存校验与规范化；不改 panel preview API 行为，不做前端 UI，不接 ClickHouse，不做变量、模板、自动刷新或告警。
- 未启动 Docker、真实后端服务、前端、浏览器或真实 MySQL；真实数据库 JSON 列读写和前端消费仍需后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：57 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：2 个文件已符合格式。
- 已运行 `uv run mypy app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：2 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0058 Dashboard panel 查询预览后端基础

### 已完成

- 新增 `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview`，针对已保存 dashboard 的单个 `config.panels[].id` 生成只读查询预览。
- 预览复用当前关系库 query service：`metrics` 返回指标窗口聚合 `items`，`logs/events/traces` 返回最近样本 `items`，`topology` 返回节点和调用边摘要。
- 复用 dashboard 读取权限语义：目标项目至少 `viewer`；普通用户无项目成员关系、项目不存在、dashboard 不属于项目、legacy config 或 panel 不存在均按隐藏式 `404` 处理；非法 panel query 白名单字段返回 `422`。
- `panel.query` 只读取已有查询 API 支持的白名单字段，未知字段忽略；本轮不引入复杂 DSL、不支持未保存草稿 config、不写 dashboard。
- 新增 `DashboardPanelPreviewResponse`，扩展 `backend/tests/test_dashboard_api.py` 覆盖 metrics/logs/events/traces/topology 成功路径、viewer 权限、无权限隐藏、legacy config/panel 不存在和非法 `limit`。
- 修复代码审计 P2：`metrics` panel 的 `query.window` 与 `query.aggregation` 在枚举判断前先校验字符串类型，历史保存配置中的数组/对象等非法值返回 `422`，不再绕过 `QueryFilterError` 形成 `500`；回归测试覆盖 list/object `window` 与 list `aggregation`。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`；新增 API 路径，因此后端版本提升到 `0.2.12`。
- 后端开发 worker Ohm 超时未产出且未修改文件，总 agent 按项目规则极窄接手实现；未修改根工作树业务代码或根协调文件。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮仍只基于关系库 `ingest_records` 查询能力，不接 ClickHouse，不做真实图表渲染、变量替换、模板、缓存、后台任务或告警。
- 未启动真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard panel preview 执行计划和前端消费仍需后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：54 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/dashboard.py app/schemas/dashboard.py tests/test_dashboard_api.py tests/test_config.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/dashboard.py app/schemas/dashboard.py tests/test_dashboard_api.py tests/test_config.py`，结果：通过。
- 已运行 `uv run mypy app/api/routes/dashboard.py app/schemas/dashboard.py tests/test_dashboard_api.py tests/test_config.py`，结果：4 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0055a-code-audit-P2 Dashboard panel 字符串规范化修复

### 已完成

- 修复 dashboard `config.panels` 审计 P2：`id/title/type` 在通过非空、长度和 `type` enum 校验后写回裁剪首尾空白后的规范化值，避免 `" metrics "` 以 `metrics` 通过校验却按原始值保存/返回。
- 重复 panel `id` 继续使用规范化值判断，覆盖 `" cpu "` 与 `"cpu"` 这类边界。
- 扩展 `backend/tests/test_dashboard_api.py`，覆盖 create/update 时带首尾空白的 panel `id/title/type` 会持久化为裁剪后的值，并覆盖带空白 `type` 仍按 enum 契约返回规范化值。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 panel `id/title/type` 的规范化保存和重复 `id` 判断规则。
- 后端版本保持 `0.2.11`：本轮仅修复 dashboard panel schema 规范化边界，不新增 API 路径、不变更存储结构或部署依赖。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard JSON 列读写仍留给后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：36 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：通过，2 个文件已格式化。
- 已运行 `uv run mypy app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：2 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-24 T-0055a Dashboard panel 配置 schema 最小后端小步

### 已完成

- 在 `DashboardCreate` / `DashboardUpdate` 的既有 `config` JSON 校验后新增最小 `config.panels` 语义校验：当 `config` 是对象且包含顶层 `panels` 时，要求 `panels` 为数组、panel 为对象、必填 `id/title/type/query`、`type` 限定为 `metrics/logs/events/traces/topology`、`query` 为对象、同数组内 `id` 不重复、可选 `layout` 的 `x/y` 非负且 `w/h` 为正数。
- 保留并复用既有 dashboard JSON 对象或数组、64 KiB、32 层、4096 节点和非有限数拒绝校验；旧版 `{}`、`{"refresh_seconds": 30}` 和未使用顶层 `panels` 的 config 结构继续兼容。
- 扩展 `backend/tests/test_dashboard_api.py`，覆盖 panel config 创建保存、更新保存、legacy config 兼容，以及非数组 panels、panel 非对象、未知 type、缺必填字段、重复 id、layout 数值非法、query 非对象等 create/update `422`。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 `config.panels` 最小契约和当前仍不做 panel 渲染、ClickHouse 查询或高级变量配置。
- 后端版本保持 `0.2.11`：本小步是兼容旧 config 的 schema 收窄增强，不新增 API 路径、不变更存储结构、不改变响应模型和部署依赖，因此不提升版本。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL JSON 列读写和 dashboard panel 配置与前端联调仍留给后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：34 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：通过，2 个文件已格式化。
- 已运行 `uv run mypy app/schemas/dashboard.py tests/test_dashboard_api.py`，结果：2 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-23 T-0053-fix Dashboard JSON 校验审计修复

### 已完成

- 修复 dashboard `layout` / `config` 审计 P2：在保持顶层仅允许 JSON 对象或数组的契约下，新增单字段 64 KiB 序列化大小上限、32 层嵌套深度上限、4096 节点复杂度上限，并拒绝 `NaN`、`Infinity`、`-Infinity`。
- 抽取 `app/schemas/json_validation.py` 复用 ingest 既有 UTF-8 JSON size 和非有限数校验风格；ingest 继续暴露并使用原有 `json_size_bytes()` / `reject_non_finite_numbers()` 名称，避免扩大行为变更面。
- `DashboardCreate` 和 `DashboardUpdate` 均接入校验；partial update 未传 `layout/config` 时保持原值，`null` 仍按现有契约返回 `422`，空对象和空数组仍可用于更新。
- 扩展 dashboard API 测试覆盖超大 JSON、过深嵌套、过高复杂度、`NaN` / `Infinity` / `-Infinity` 在 create/update 均返回 `422`，以及 name-only patch 和空对象/空数组更新语义。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 dashboard JSON 大小、深度、复杂度和非有限数限制；后端版本保持 `0.2.10`。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；MySQL JSON 列真实写入和执行计划仍留给后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py -q`，结果：20 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py -q`，结果：33 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_ingest_api.py -k non_finite -q`，结果：11 个测试通过、27 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：通过，87 个文件已格式化。
- 已运行 `uv run mypy .`，结果：87 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-23 T-0053 Dashboard CRUD 后端基础

### 已完成

- 新增 `dashboards` 持久化模型与 Alembic 迁移 `20260623_0009_create_dashboards.py`，字段包含 `project_id`、`name`、`description`、`layout` JSON、`config` JSON、`created_by_user_id`、`updated_by_user_id`、创建/更新时间，并添加 `(project_id, updated_at, id)` 列表索引。
- 新增 `DashboardCreate`、`DashboardUpdate`、`DashboardResponse`、`DashboardListResponse`，校验名称/描述长度、JSON 对象或数组、空 patch、`limit/offset` 边界。
- 新增 dashboard repository/service/API route，提供 `GET/POST /api/v1/dashboards` 和 `GET/PATCH/DELETE /api/v1/projects/{project_id}/dashboards/{dashboard_id}`。
- 复用 Bearer 用户认证和项目 RBAC：列表/读取要求 `viewer`，创建/更新/删除要求 `editor`；无项目成员关系按 `404 项目不存在` 隐藏，跨项目 dashboard ID 按 `404 仪表盘不存在` 隐藏，超级用户仍要求项目存在。
- 补充后端测试覆盖 CRUD 成功路径、分页、审计字段、权限隔离、未认证、无权限/不存在资源、校验错误、repository 外键映射、SQLite migration 升降级和 MySQL JSON DDL 编译。
- 更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md`、版本声明和版本测试；后端版本提升到 `0.2.10`，建议总 agent 判断是否同步根/前端版本。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮不做前端 dashboard 页面、panel 图表渲染、变量/时间范围高级配置、ClickHouse 查询、告警规则或完整前后端联合测试。
- 开发侧未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL dashboard migration/API CRUD、JSON 列读写和执行计划留给后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_dashboard_api.py`，结果：13 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_dashboard_api.py tests/test_config.py`，结果：26 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：186 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：通过，86 个文件已格式化。
- 已运行 `uv run mypy .`，结果：86 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。
- 已运行 SQLite Alembic 临时库升降级：`uv run alembic -x database_url=sqlite:///<temp>.db upgrade head` 与 `downgrade base`，结果：通过，临时 SQLite 文件已删除。
- 已运行 MySQL 方言离线 SQL 生成：`uv run alembic -x database_url=mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4 upgrade 20260622_0008:head --sql` 和 `downgrade 20260623_0009:20260622_0008 --sql`；输出包含 `CREATE TABLE dashboards`、`layout JSON NOT NULL`、`config JSON NOT NULL`、`ix_dashboards_project_updated_at_id` 和 `DROP TABLE dashboards`。
- 测试 agent `Lovelace the 2nd` 完成后端专项复验，结论：通过。其执行 dashboard/config pytest、全量 pytest、相关 ruff/format/mypy 和 MySQL 离线 SQL 生成均通过；未启动 Docker、真实 MySQL、后端服务、前端、浏览器或长驻进程，无需清理资源。

### 待测试 / 待审计

- 请总 agent 在本后端提交 push 后启动代码审计 agent 审查 T-0053 dashboard CRUD、权限隐藏、JSON schema、migration 和文档契约。

## 2026-06-23 T-0051-fix Trace 服务拓扑审计阻断修复

### 已完成

- 修复审计 P1：新增 `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT` 配置，默认 `10000`，通过 `QueryService` 传入 repository；`list_trace_spans_for_topology()` 在数据库侧应用 `.limit()`，避免未传时间范围时读取项目全部 trace span。
- 明确语义：API `limit` 仍只限制返回节点数和两端可见节点的边；scan limit 是独立的数据库读取窗口，用于控制拓扑构建的最大 span 扫描量。
- 修复审计 P2：同一 `trace_id` 内重复 `span_id` 被视为 ambiguous parent id；child 指向该 parent id 时跳过 edge，不再使用第一条 span 或任意 span 推导跨 source 边，节点统计仍包含这些 span。
- 补充 repository/API/config/topology 测试，覆盖数据库侧 scan limit、API `limit` 与 scan limit 分离、重复 parent `span_id` 不误生成边，以及配置读取和非正值拒绝。
- 更新 `backend/.env.example`、`backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录 scan limit 配置、`limit` 语义差异和重复 `span_id` 处理规则；后端版本保持 `0.2.8`。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮未启动 Docker、真实 MySQL、后端服务、前端或浏览器；真实 MySQL 拓扑大数据量执行计划仍留给后续专项补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "topology or hide_missing_project_from_superuser or requires_user_token" -q`，结果：12 个测试通过、42 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_config.py -q`，结果：13 个测试通过。
- 已运行 `uv run pytest -q`，结果：173 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：通过，79 个文件已格式化。
- 已运行 `uv run mypy`，结果：79 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-23 T-0051 Trace 服务拓扑后端基础

### 已完成

- 新增 `GET /api/v1/query/traces/topology`，复用 Bearer 用户认证、项目权限过滤和 query service/repository 分层；`project_id` 必填，支持 `occurred_from`、`occurred_to`、`source`、`limit`。
- 查询来源限定为关系库 `ingest_records.kind=trace`，从 trace span payload 顶层字段展开后在 service 层推导服务拓扑：span `source` 为节点，同一 `trace_id` 内 child `parent_span_id` 指向 parent `span_id` 且两端 source 非空不同则生成 source-to-source edge。
- 响应稳定为 `{"nodes": [...], "edges": [...]}`；节点包含 `source`、`span_count`、`trace_count`、`error_span_count`、`avg_duration_ms`、`max_duration_ms`，边包含 `from_source`、`to_source`、`call_count`、`error_count`、`avg_duration_ms`、`max_duration_ms`。
- `source` 筛选返回目标 source 及相邻 source 子图；缺 parent、缺 source 和同 source parent-child 稳定忽略，不生成边；错误计数按 `status_code == error`，duration 聚合按 trace payload 顶层 `duration_ms`。
- 补充接口测试覆盖权限、必填 `project_id`、时间/source 过滤、limit、parent-child source edge、同 source 不成 edge、缺 parent/缺 source 忽略、空结果、错误计数和 duration 聚合。
- 更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md`、版本声明和版本测试；后端版本提升到 `0.2.8`，建议总 agent 判断是否同步根/前端版本。

### 阻塞与风险

- 暂无实现阻塞。
- 本轮不接 ClickHouse，不做前端拓扑图，不做复杂布局，不改 trace ingestion 契约，不做跨项目聚合或任意标签拓扑。
- 开发侧未启动 Docker、真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL 拓扑查询执行计划和大数据量性能留给后续专项验证。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "topology or hide_missing_project_from_superuser or requires_user_token" -q`，结果：9 个测试通过、42 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py tests/test_config.py -q`，结果：62 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py`，结果：通过。
- 已运行 `uv run ruff check app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：通过，7 个文件已格式化。
- 已运行 `uv run mypy app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：7 个源文件无类型错误。
- 已运行 `uv lock --check`，结果：通过。
- 已运行 `git diff --check`，结果：通过。
- 测试 agent `Herschel the 2nd` 完成后端专项复验，结论：通过。其执行 `uv run pytest tests/test_query_api.py -k "topology or query_traces or hide_missing_project_from_superuser or requires_user_token" -q`，结果 16 passed、35 deselected；`uv run pytest tests/test_config.py -q`，结果 11 passed；相关 ruff check、ruff format --check、mypy 均通过。未启动 Docker、真实 MySQL、后端服务、前端、浏览器或临时数据库，无需清理资源。

### 待测试 / 待审计

- 请总 agent 在本后端提交 push 后启动代码审计 agent 审查 T-0051 服务拓扑后端基础、权限/过滤边界和聚合语义。

## 2026-06-23 T-0047 Trace 查询筛选扩展

### 已完成

- 扩展 `GET /api/v1/query/traces` 可选筛选：`status_code` 精确匹配 trace payload 顶层 `status_code`，trim 后空白按未传处理，长度边界为 `1..64`；`duration_min_ms` / `duration_max_ms` 按 trace payload 顶层 `duration_ms` 做数值上下界过滤。
- 新筛选已纳入 trace cursor 签名：`status_code` 使用规范化后的值，`duration_min_ms` / `duration_max_ms` 使用查询数值；旧 cursor 用于不同 status 或 duration 范围时继续返回 `422 cursor 无效或不匹配当前查询`。
- 保持响应 envelope `{items, next_cursor}`、既有字段、Bearer 用户认证、项目权限过滤、显式不存在项目 `404`、source/name/trace_id/span_id/time/cursor 现有行为不变。
- 补充 pytest 覆盖 status/duration 组合筛选、status trim 空白、status 长度、duration 非负/有限/反向区间、cursor 签名不匹配和 SQLite/MySQL/MariaDB duration JSON 数值比较 SQL 编译。
- 更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md`、版本声明和版本测试；后端版本提升到 `0.2.4`，建议总 agent 判断是否同步根 `VERSION`。

### 阻塞与风险

- 暂无实现阻塞。
- 开发侧未启动 Docker，未启动真实 MySQL、真实后端服务、前端或浏览器；真实 MySQL JSON 数值比较执行语义、执行计划和前后端联测留给测试/总 agent 后续专项。
- 根工作树曾因工具相对路径误落 3 个后端文件改动，已停止在根工作树写入；正确改动已重新落到 `C:\Users\q-lau\Documents\telemetry-worktrees\backend`。根工作树错误位置残留待总 agent 确认 backend 分支包含后清理。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "traces or trace_duration or trace_payload" -q`，结果：10 个测试通过、38 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py tests/test_config.py -q`，结果：59 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/query.py app/services/query.py app/repositories/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/query.py app/services/query.py app/repositories/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：通过。
- 已运行 `uv run mypy app/api/routes/query.py app/services/query.py app/repositories/query.py tests/test_query_api.py app/core/config.py tests/test_config.py`，结果：6 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。
- 测试 agent `Lagrange the 2nd` 完成后端专项复验，结论：通过。其执行 `uv run pytest tests/test_query_api.py -k "query_traces or hide_projects_without_membership or hide_missing_project_from_superuser or trace_payload_field_filter or trace_duration_filter"`、`uv run pytest tests/test_config.py`、`uv run pytest --ignore=tests/test_clickhouse_init.py --ignore=tests/test_mongodb_init.py`、`uv run ruff check .`、`uv run ruff format --check .`、`uv run mypy .` 均通过；未启动 Docker、真实 MySQL、后端服务或浏览器，无需清理资源。

### 待审计

- 请总 agent 在确认根工作树错误位置改动处理策略后，启动代码审计 agent 审查 T-0047 trace 查询筛选扩展、cursor 签名、SQLAlchemy JSON 数值比较和测试边界。

## 2026-06-23 T-0045 审计 P3 小修

### 已完成

- 修复 Russell 对 `2d357a7` 的 P3 意见：`ingest_records.received_at` 的 ORM `server_default` 改为方言感知默认表达式，MySQL/MariaDB 建表 DDL 编译为 `CURRENT_TIMESTAMP(6)`，SQLite 仍保持 `CURRENT_TIMESTAMP`，与 0008 迁移最终态对齐且不破坏本地 SQLite 测试。
- 补充 `test_ingest_record_model_received_at_default_matches_dialect`，锁定 MySQL、MariaDB 和 SQLite 三种方言下的 `received_at` 默认值 DDL。
- 更新 `backend/README.md` 与 `backend/migrations/README.md`，明确生产建库/升级使用 Alembic，`create_all()` 仅用于测试或一次性临时库；补充 0008 修改 `occurred_at` / `received_at` 且 `received_at` 参与索引时，在真实 MySQL/MariaDB 大表上的在线 DDL 风险、备份/回滚、锁等待、复制延迟和维护窗口评估要求。

### 阻塞与风险

- 暂无阻塞。
- 本轮未启动 Docker、真实 MySQL、后端服务或浏览器；真实 MySQL/MariaDB 大表 ALTER 的锁行为和执行时长仍需在生产同版本影子库或维护窗口前演练确认。

### 开发侧验证

- 已运行 `uv run pytest tests/test_ingest_api.py -k "ingest_record_model or migration_sqlite" -q`，结果：4 个测试通过、34 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/models/ingest.py tests/test_ingest_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/models/ingest.py tests/test_ingest_api.py`，结果：通过。
- 已运行 `uv run mypy app/models/ingest.py tests/test_ingest_api.py`，结果：通过。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-22 T-0045 真实联测 trace 查询修复

### 已完成

- 修复显式 `project_id` 存在性校验：`GET /api/v1/query/events|logs|metrics|traces` 和 `GET /api/v1/query/metrics/aggregate` 现在在传入 `project_id` 时都会先确认项目存在；普通用户无权项目和不存在项目仍统一返回 `404 项目不存在`，超级用户查询不存在项目也返回 `404 项目不存在`，不再空数组成功。
- 修复 MySQL/MariaDB 下 `ingest_records.occurred_at` 秒级截断导致的 trace 毫秒过滤问题：ORM 与建表迁移对 `occurred_at` / `received_at` 使用 `DATETIME(6)`，并新增 `20260622_0008_ingest_records_mysql_microseconds.py` 将已有 MySQL/MariaDB 列升级为 `DATETIME(6)`，`received_at` 默认值调整为 `CURRENT_TIMESTAMP(6)`。
- 补充 SQLite API 回归测试，覆盖 `occurred_to=2026-06-22T01:00:00.075Z` 不返回 `start_time=2026-06-22T01:00:00.100Z` 的 trace span。
- 补充 MySQL/MariaDB DDL 编译回归测试，锁定 `ingest_records.occurred_at` 和 `received_at` 在 MySQL/MariaDB 方言下为 `DATETIME(6)`。
- 更新 `backend/README.md`、`backend/migrations/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录显式项目缺失语义、毫秒过滤语义和 Debian/MySQL 兼容性说明。

### 阻塞与风险

- 暂无阻塞。
- 开发侧未启动 Docker，未启动真实后端/前端服务；本地未配置真实 MySQL 服务，因此真实 MySQL 写入和 HTTP 联测留给测试 agent 复验。
- MySQL/MariaDB 0008 回滚会把时间列收窄回秒级 `DATETIME`，历史微秒部分会由数据库截断；生产接入毫秒过滤语义后不建议回滚。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "traces or superuser" -q`，结果：7 个测试通过、38 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_ingest_api.py -k "ingest_record_model or migration_sqlite" -q`，结果：3 个测试通过、34 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。

## 2026-06-22 T-0045 Trace 查询最小后端基础

### 已完成

- 新增 `GET /api/v1/query/traces`，复用现有 Bearer 用户认证、项目权限过滤、`QueryService` / `SqlAlchemyQueryRepository` 分层和统一 `{items, next_cursor}` 分页 envelope。
- 查询来源限定为关系库 `ingest_records.kind=trace`，字段从 T-0044 trace payload 顶层关键字段读取：`trace_id`、`span_id`、`parent_span_id`、`name`、`start_time`、`end_time`、`duration_ms`、`status_code`、`attributes` 和业务 `payload`。
- 支持最小筛选：`project_id`、`trace_id`、`span_id`、`name`、`source`、`occurred_from`、`occurred_to`、`limit`、`cursor`；`trace_id` / `span_id` 在 service 层 trim，trim 后空白按未传处理，trim 后超过 128 返回 `422`。
- 复用查询分页游标签名/校验模式：trace cursor 绑定查询类型和当前筛选条件，旧 cursor 用于不同 trace 筛选或其他查询类型时返回 `422 cursor 无效或不匹配当前查询`。
- 排序沿用现有查询 API 的稳定模式：按 `received_at desc, id desc` 返回并生成 cursor；时间范围筛选仍按 span `occurred_at`（即 `start_time`）执行。取舍是先保证关系库分页在同一接收时间下不重复/不漏项，span 树、水瀑图所需的 start_time 拓扑排序留给后续专门接口或前端展示层。
- 本次未新增 Alembic 迁移：trace 查询复用既有 `ingest_records(project_id, kind, received_at, id)` 组合索引，新增过滤只使用既有 `event_type` / `source` 列和 JSON payload 顶层字符串字段；已补 SQLite/MySQL/MariaDB SQL 编译断言。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`。版本暂不提升：本小步只新增后端查询能力，建议总 agent 在 T-0045 集成、审计和真实库测试通过后统一判断是否将根/后端/前端同步到 `0.2.3`。

### 阻塞与风险

- 暂无阻塞。
- 本轮不接 ClickHouse，不做 trace tree/waterfall、服务拓扑、跨信号关联、日志互跳、前端页面或前端 API client。
- 开发侧未启动本地 MySQL、Docker、真实 FastAPI 服务或浏览器；真实 MySQL JSON 字段执行语义、组合索引执行计划和真实后端 HTTP 验证留给后续测试 agent。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "traces or trace_payload" -q`，结果：6 个测试通过、37 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py -q`，结果：43 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py`，结果：通过。
- 已运行 `uv run mypy app/api/routes/query.py app/repositories/query.py app/schemas/query.py app/services/query.py tests/test_query_api.py`，结果：5 个源文件无类型错误。

## 2026-06-22 T-0044 Trace ingestion 最小后端基础

### 已完成

- 新增 `POST /api/v1/ingest/traces`，沿用摄入 API Key 鉴权，支持 `Authorization: Bearer <api_key>` 与 `X-API-Key`，项目归属只来自 API Key 校验上下文，不接受客户端顶层 `project_id`。
- 新增 trace schema：请求体为 `{"spans": [...]}`，每批 1 到 100 条、整体不超过 256 KiB；单条 span 支持 `trace_id`、`span_id`、`parent_span_id`、`name`、`start_time`、`end_time`、`duration_ms`、`status_code`、`source`、`attributes` 和业务 `payload`。
- trace 校验覆盖必填字段、批量数量/大小、非有限数值、负数 `duration_ms`、`end_time` 早于 `start_time`、起止时间时区格式不一致，以及嵌套 `attributes`/`payload` 中的 `NaN`/`Infinity`。
- 复用 `ingest_records` 最小持久化：traces 写入 `kind=trace`，`event_type` 映射为 span `name`，`source` 映射为 span `source`，`occurred_at` 映射为 `start_time`，`payload` 保存 trace/span 关键字段、业务 payload 和原始 span `raw`。
- 复用 `ingest_stats`：成功 trace 摄入按分钟桶、项目、API Key、`kind=trace` 和 source 统计；已验证 API Key 后的 trace 请求体验证失败和限流拒绝也按 `kind=trace` 统计，不再误计到 event。
- 本次未新增 Alembic 迁移：`ingest_records.kind` 既有类型为字符串列，可兼容新增 `trace` kind；已在 SQLite 迁移测试中断言 `kind` 列仍为 `VARCHAR`，作为 SQL 兼容边界。
- 更新 `backend/README.md`、`agents/runtime/api-contracts/backend.md`、`backend/VERSION`、`backend/pyproject.toml`、`backend/uv.lock`、配置兜底版本和版本测试；后端版本提升到 `0.2.2`。

### 阻塞与风险

- 暂无阻塞。
- 本轮不接 ClickHouse，不做 trace 查询 API，不做 waterfall/服务拓扑/前端页面；真实 MySQL/Redis/ClickHouse/MongoDB、真实后端服务和前后端联测未在开发侧执行，留给后续测试/审计专项。
- 成功 trace 统计按 span `start_time` 入桶，限流拒绝按请求当前时间入桶，同一 API Key 的 accepted/rejected trace stats 可能分布在不同 bucket；测试已按统计合计断言。
- 后端版本已提升到 `0.2.2`；建议总 agent 判断是否同步根 `VERSION`，本任务不要求前端版本同步。

### 开发侧验证

- 已运行 `uv run pytest tests/test_ingest_api.py -q`，结果：36 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_ingest_api.py tests/test_config.py -q`，结果：47 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/schemas/ingest.py app/services/ingest.py app/api/routes/ingest.py app/api/dependencies.py app/core/application.py tests/test_ingest_api.py`，结果：通过。
- 已运行 `uv run mypy app/schemas/ingest.py app/services/ingest.py app/repositories/ingest.py app/api/routes/ingest.py app/core/application.py app/api/dependencies.py`，结果：6 个源文件无类型错误。
- 已运行 `uv run ruff format --check app/schemas/ingest.py app/services/ingest.py app/api/routes/ingest.py app/api/dependencies.py app/core/application.py app/core/config.py tests/test_ingest_api.py tests/test_config.py`，结果：8 个文件已格式化。
- 已运行 `git diff --check`，结果：通过。
- 测试 agent `Lagrange` 在实现前完成只读基线复验：确认当时 `/api/v1/ingest/traces` 为 404，并指出 validation path 映射和限流拒绝 kind 统计风险；本实现已补齐并加回归测试。
- 测试 agent `Dirac` 在实现后完成只读专项复验：`uv run pytest tests/test_ingest_api.py -q`、`uv run ruff check app tests/test_ingest_api.py`、trace 相关 mypy 均通过；额外 TestClient 探测确认最小 trace span `202`，顶层 `project_id`、深层 `NaN`、时区混用、span 多余字段均 `422`，拒绝统计落在 `kind=trace`。

## 2026-06-22 T-0043 日志 request/user 字段过滤基础

### 已完成

- 为 `GET /api/v1/query/logs` 新增可选查询参数 `request_id` 和 `user_id`；后端在服务层 trim，trim 后空白字符串按未传处理，trim 后长度超过 128 返回 `422`。
- `request_id` / `user_id` 只按关系库 `ingest_records.payload.attributes.request_id` / `payload.attributes.user_id` 结构化 `attributes` 白名单字段精确匹配，不作为 keyword 文本搜索，不搜索日志业务 `payload` 内同名字段，不开放任意 JSON 字段查询。
- 修复审计 P2：为 `request_id` / `user_id` 的 attributes 过滤增加显式 JSON 类型守卫，仅 JSON string/text 值参与精确匹配；numeric/boolean/object/array 同名 attributes 值不会因数据库 JSON unquote/text 化而误命中。
- `request_id` / `user_id` 与现有 `project_id`、`level`、`source`、`keyword`、`trace_id`、`span_id`、时间范围、`limit` 和 `cursor` 叠加生效。
- 将规范化后的 `request_id` / `user_id` 纳入日志查询 cursor 签名；筛选条件不匹配的旧 cursor 继续返回既有 `422 cursor 无效或不匹配当前查询`。
- 扩展 `backend/tests/test_query_api.py`，覆盖 request/user 精确过滤、字符串 attributes 命中、numeric/boolean/object/array 同名 attributes 不命中、业务 payload 同名字段不误命中、trim 与长度校验、与 keyword/level/source/trace/span/project 权限组合、request/user cursor 签名不匹配，以及 MySQL/MariaDB/SQLite SQL 编译包含类型守卫。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，同步日志 request/user 白名单字段仅匹配 JSON string/text 值的契约和验证边界。

### 阻塞与风险

- 暂无阻塞。
- 本轮仍基于关系库 JSON 字段过滤，未启动真实 MySQL、ClickHouse、MongoDB、Redis、后端服务或前端，不做完整前后端联测；MySQL/MariaDB/SQLite 类型守卫已有 SQL 编译断言和 SQLite API 回归覆盖，真实 MySQL JSON 嵌套 attributes 精确过滤执行计划、大数据量性能和后续 ClickHouse 日志查询留给测试 agent 或后续专项验证。

### 开发侧验证

- 本次审计 P2 修复已运行 `uv run pytest tests/test_query_api.py -k "request or user or cursor"`，结果：17 个测试通过、20 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 本次审计 P2 修复已运行 `uv run ruff check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次审计 P2 修复已运行 `uv run ruff format --check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次审计 P2 修复已运行 `uv run mypy app/repositories/query.py tests/test_query_api.py`，结果：2 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-22 T-0042 Metrics 聚合窗口基础

### 已完成

- 新增独立接口 `GET /api/v1/query/metrics/aggregate`，不改变既有 `GET /api/v1/query/metrics` envelope、游标分页或行为。
- 聚合接口沿用现有 Bearer 用户鉴权和项目权限过滤；无权限显式 `project_id` 继续返回 `404 项目不存在`，未指定项目时仅返回当前用户可访问项目的数据。
- 支持查询参数 `project_id`、`name`、`source`、`occurred_from`、`occurred_to`、`window`、`aggregation`、`limit`；`window` 默认 `5m`，支持 `1m/5m/15m/1h`；`aggregation` 默认 `avg`，支持 `avg/sum/min/max/count`；`limit` 默认 `100`，范围 `1..500`。
- 基于关系库 `ingest_records.kind=metric` 与 JSON payload `value` 实现固定窗口聚合，按 `project_id`、指标名、`source` 和窗口开始时间分组；响应为 `{"items": [...]}`，item 包含 `project_id`、`name`、`source`、`window_start`、`window_end`、`aggregation`、`value`、`sample_count`、`unit`。
- 修复审计 P2：MySQL/MariaDB 指标聚合窗口不再使用受 session time zone 影响的 `UNIX_TIMESTAMP(DATETIME)`，改用 `TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', occurred_at)` 按 UTC 存储时间相对 Unix epoch 稳定分桶；SQLite 路径保持原有 epoch seconds 行为。
- 修复真实 MySQL 联测发现的窗口下取整问题：MySQL/MariaDB 聚合窗口 epoch 秒差在除以 `window_seconds` 后显式 `FLOOR(...)` 再乘回窗口长度，避免 `00:00:59`、`00:04:59` 等边界样本被上浮到下一桶。
- `unit` 当前取窗口内最小非空 unit；初版不引入 cursor、tags group by、percentile、Top N、单位换算或 ClickHouse。
- 扩展 `backend/tests/test_query_api.py`，覆盖 avg/sum/min/max/count、窗口分桶、项目权限、name/source/time 叠加过滤、无匹配空数组、非法 window/aggregation 422、limit、未登录拒绝，以及 MySQL/MariaDB 聚合窗口 SQL 编译为 `FLOOR(TIMESTAMPDIFF(...) / window_seconds)` 且不出现 `UNIX_TIMESTAMP(occurred_at)`。
- 更新 `backend/README.md` 与 `agents/runtime/api-contracts/backend.md`，同步 API-0019 当前契约、MySQL/MariaDB UTC epoch 分桶说明和验证边界。

### 阻塞与风险

- 暂无阻塞。
- 本轮不启动真实前端、后端服务、数据库容器或完整前后端联测；聚合实现已用 SQLite API 测试覆盖，并用 MySQL/MariaDB SQL 编译断言覆盖 timezone 偏移和窗口下取整风险。真实 MySQL JSON 数值表达式、窗口分桶执行计划、大数据量性能和后续 ClickHouse 聚合仍需测试/专项任务补验。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "aggregate"`，结果：4 个测试通过、26 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py`，结果：30 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/query.py app/services/query.py app/repositories/query.py app/schemas/query.py tests/test_query_api.py`，结果：通过。
- 已运行 `uv run ruff format --check app/api/routes/query.py app/services/query.py app/repositories/query.py app/schemas/query.py tests/test_query_api.py`，结果：通过。
- 已运行 `uv run mypy app/api/routes/query.py app/services/query.py app/repositories/query.py app/schemas/query.py`，结果：4 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。
- 本次 P2 修复已运行 `uv run pytest tests/test_query_api.py -k "aggregate"`，结果：5 个测试通过、26 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 本次 P2 修复已运行 `uv run pytest tests/test_query_api.py`，结果：31 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 本次 P2 修复已运行 `uv run ruff check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次 P2 修复已运行 `uv run ruff format --check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次 P2 修复已运行 `uv run mypy app/repositories/query.py tests/test_query_api.py`，结果：2 个源文件无类型错误。
- 本次 P2 修复已运行 `git diff --check`，结果：通过。
- 本次真实 MySQL 联测分桶修复已运行 `uv run pytest tests/test_query_api.py -k "aggregate"`，结果：5 个测试通过、26 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 本次真实 MySQL 联测分桶修复已运行 `uv run ruff check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次真实 MySQL 联测分桶修复已运行 `uv run ruff format --check app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 本次真实 MySQL 联测分桶修复已运行 `uv run mypy app/repositories/query.py tests/test_query_api.py`，结果：2 个源文件无类型错误。
- 本次真实 MySQL 联测分桶修复已运行 `git diff --check`，结果：通过。

## 2026-06-22 T-0041 日志结构化字段过滤基础

### 已完成

- 为 `GET /api/v1/query/logs` 新增可选查询参数 `trace_id` 和 `span_id`；后端在服务层 trim，trim 后空白字符串按未传处理，trim 后长度超过 128 返回 `422`。
- `trace_id` / `span_id` 只按关系库 `ingest_records.payload.trace_id` / `payload.span_id` 顶层结构化字段精确匹配，不作为 keyword 文本搜索，不搜索日志业务 `payload`，不新增 `request_id`。
- `trace_id` / `span_id` 与现有 `project_id`、`level`、`source`、`keyword`、时间范围、`limit` 和 `cursor` 叠加生效。
- 将规范化后的 `trace_id` / `span_id` 纳入日志查询 cursor 签名；筛选条件不匹配的旧 cursor 继续返回既有 `422 cursor 无效或不匹配当前查询`。
- 扩展 `backend/tests/test_query_api.py`，覆盖 trace/span 精确过滤、业务 payload 同名字段不误命中、trim 与长度校验、与 keyword/level/source/project 权限组合、以及 trace/span cursor 签名不匹配。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，同步日志结构化字段过滤契约和验证边界。

### 阻塞与风险

- 暂无阻塞。
- 本轮仍基于关系库 JSON 字段过滤，未启动真实 MySQL、ClickHouse、MongoDB、Redis、后端服务或前端，不做完整前后端联测；真实 MySQL JSON 表达式执行计划和大数据量性能留给后续专项/测试 agent 验证。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "trace or keyword or cursor"`，结果：13 个测试通过、12 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py`，结果：26 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check app/api/routes/query.py app/services/query.py app/repositories/query.py tests/test_query_api.py`，结果：通过。
- 已运行 `uv run mypy app/api/routes/query.py app/services/query.py app/repositories/query.py`，结果：3 个源文件无类型错误。

## 2026-06-22 T-0039 日志关键词搜索基础

### 已完成

- 为 `GET /api/v1/query/logs` 新增可选查询参数 `keyword`，沿用用户 Bearer token 鉴权、项目权限过滤、`project_id`、`level`、`source`、`occurred_from/to` 和游标分页约束。
- `keyword` 进入服务层后会去除前后空白，空白字符串按未传处理；非空关键词参与日志查询游标签名，筛选条件变化后复用旧 cursor 会返回既有 `422 cursor 无效或不匹配当前查询`。
- 在关系库 `ingest_records` 的 `kind=log` 查询上实现基础关键词搜索：匹配日志 `message`，并覆盖日志业务 `payload` 的值文本；未引入 ClickHouse、全文索引或新外部服务。
- 修复审计 P2：不再将整份日志 wrapper JSON 或业务 payload 对象 cast 为 text 后匹配，避免 keyword 因 wrapper key 名 `payload`/`trace_id`/`logger`、业务 payload key 名或 `null` 脚手架命中无关日志；LIKE 参数继续转义 `%`、`_` 和反斜杠，按字面搜索。
- 扩展 `backend/tests/test_query_api.py`，覆盖 keyword 命中 message、命中业务 payload 值文本、业务 payload key-only 不命中、SQLite 递归命中业务 payload 嵌套/数组值、不命中 wrapper key/null 脚手架、LIKE 通配符字面匹配、与 level/source/time/project 权限叠加、分页 cursor 与 keyword 不匹配返回 `422`。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，同步 API-0015 的 `keyword` 参数、游标签名边界和当前验证边界。

### 阻塞与风险

- 本轮关键词搜索仍基于关系库 JSON 子路径值文本 `LIKE` 匹配，适合作为基础能力；SQLite 覆盖业务 payload 嵌套对象/数组中的字符串、数字和布尔值，MySQL 兼容层通过 `JSON_SEARCH` 覆盖业务 payload 字符串值；真实 MySQL 非字符串 JSON 标量值、大数据量性能、排序分页执行计划、大小写/字符集匹配细节和未来 ClickHouse/全文搜索链路仍需后续专项验证。
- 未做完整前后端联测；未启动后端服务、数据库容器或后台进程。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py`，结果：22 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff format .`，结果：1 个测试文件格式化，77 个文件未变化。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run mypy .`，结果：78 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。
- 已运行 `uv run pytest`，结果：129 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。

## 2026-06-22 T-0038 审计 P2 日志上下文索引修复

### 已完成

- 修复后端审计 P2：为 `ingest_records` 补充组合索引 `ix_ingest_records_project_kind_received_at_id(project_id, kind, received_at, id)`，支撑日志上下文 before/after 的 `project_id + kind + received_at/id` 窗口查询，降低真实数据量下宽扫描和 filesort 风险。
- 同步更新 `IngestRecordModel.__table_args__` 和 Alembic 迁移 `20260622_0007_add_ingest_records_query_index.py`，保持 ORM metadata 与迁移一致；迁移兼容 SQLite 测试和 MySQL 运行。
- 补充 `backend/tests/test_ingest_api.py` 索引元数据与 SQLite Alembic `upgrade head` 后实际索引列断言，防止模型和迁移脱节。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，记录该组合索引可被日志上下文和带项目过滤的 events/logs/metrics 分页查询复用，审计 P2 已修。

### 阻塞与风险

- 当前 worktree 未启动真实 MySQL，本轮验证覆盖 SQLite 迁移和静态检查；真实 MySQL 大数据量执行计划、基数选择和线上慢查询仍需后续在专用环境用真实数据或压测数据复验。
- 未修改查询语义、API 契约或前端联动；不做完整前后端联测。

### 开发侧验证

- 已运行 `uv run pytest tests/test_ingest_api.py -k "query_window_index or migration"`，结果：2 个测试通过、26 个 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest tests/test_query_api.py`，结果：17 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已使用 `sqlite:///./tmp-t0038-index-alembic.db` 运行 `uv run alembic upgrade head` 和 `uv run alembic downgrade base`，结果：SQLite 迁移升降级通过，临时数据库文件已删除。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：78 个文件已格式化。
- 已运行 `uv run mypy .`，结果：78 个源文件无类型错误。
- 已运行 `uv run pytest`，结果：124 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `git diff --check`，结果：通过。
- 已运行 MySQL dialect 离线 SQL 生成：`uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' upgrade 20260621_0006:head --sql` 和 `uv run alembic -x database_url='mysql+pymysql://user:pass@127.0.0.1:3306/telemetry?charset=utf8mb4' downgrade 20260622_0007:20260621_0006 --sql`；输出包含 `CREATE INDEX ix_ingest_records_project_kind_received_at_id ON ingest_records (project_id, kind, received_at, id)` 和对应 `DROP INDEX`。真实 MySQL 执行仍需后续专用环境补验。

## 2026-06-22 版本同步

### 已完成

- 随阶段 3 查询与展示 MVP 当前进度，将 `backend/VERSION`、`backend/pyproject.toml`、`backend/uv.lock` 和后端配置兜底版本同步到 `0.2.0`。
- 更新 `backend/tests/test_config.py` 的版本文件断言，以及 `backend/README.md` 的健康检查示例版本。

## 2026-06-22 T-0038 后版本同步

### 已完成

- 随日志上下文 API 和查询窗口组合索引迁移合入 `dev`，将 `backend/VERSION`、`backend/pyproject.toml`、`backend/uv.lock`、后端配置兜底版本、`backend/tests/test_config.py` 和 `backend/README.md` 的后端版本同步到 `0.2.1`。
- 本次版本提升原因：新增 `GET /api/v1/query/logs/{log_id}/context` API，并新增 `ix_ingest_records_project_kind_received_at_id` 组合索引迁移支撑日志上下文和分页查询。

### 阻塞与风险

- 本轮仅做版本声明同步，不修改后端 API、数据库迁移或业务行为。
- 运行中的真实联测 agent 如启动了后端服务或真实数据库临时库，应由该 agent 自行清理自己的进程和临时资源；本次版本同步不关闭任何进程。

### 下一步

- 等待总 agent 完成根仓库验证、提交、推送和 GitHub Actions 复查。

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

## 2026-06-21 T-0025 摄入 API Key 限流基础

### 已完成

- 新增 `InMemoryFixedWindowRateLimiter`，支持按 key 做固定窗口计数；当前用于单进程开发/测试，后续可替换为 Redis 分布式计数器。
- 新增 `INGEST_RATE_LIMIT_ENABLED` 和 `INGEST_RATE_LIMIT_PER_MINUTE` 配置，默认关闭且每分钟默认 600 次。
- 在摄入 API Key 验证通过后执行限流检查；超限返回 `429 Too Many Requests`、`detail=摄入请求过于频繁` 和 `Retry-After`。
- 更新 `.env.example`、`README.md` 和 `agents/runtime/api-contracts/backend.md`，记录限流配置、响应契约和当前边界。
- 补充配置读取测试和摄入超限回归测试。

### 阻塞与风险

- 本次未连接真实 Redis，限流计数只在单进程内存中有效；多实例、进程重启、跨服务共享限流和 Redis 故障策略仍需后续任务处理。

### 验证

- 已运行 `uv run pytest tests/test_config.py tests/test_ingest_api.py`，结果：31 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：95 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：70 个文件已格式化。
- 已运行 `uv run mypy .`，结果：70 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0026 摄入统计基础

### 已完成

- 新增关系库 `ingest_stats` 聚合表和 Alembic migration `20260621_0006_create_ingest_stats.py`。
- 摄入成功后按分钟桶、项目、API Key、kind 和 source 聚合写入 `accepted_count` 与 `bytes_count`；同一批次内先按统计维度聚合，避免唯一键冲突。
- 新增 `GET /api/v1/ingest/stats` 后台查询接口，使用用户 Bearer token 鉴权；普通用户只能查看自己有项目角色的统计，无权项目返回 `404`。
- 更新 README 和后端契约草案，记录统计接口、响应字段、验证边界和当前只统计成功路径的限制。
- 补充摄入统计写入/查询/权限测试，并扩展 SQLite migration 升降级测试覆盖 `ingest_stats`。

### 阻塞与风险

- 当前统计仍写入关系库，不直接写 ClickHouse `ingest_stats`；`rejected_count` 仅预留，校验失败、无效 API Key、限流等失败路径统计后续补齐。
- 真实 MySQL 聚合更新并发、ClickHouse 同步和后台统计页面仍需后续任务覆盖。

### 验证

- 已运行 `uv run pytest tests/test_ingest_api.py`，结果：23 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：97 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：71 个文件已格式化。
- 已运行 `uv run mypy .`，结果：71 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0027 Redis 摄入限流后端基础

### 已完成

- 新增 Redis 固定窗口限流后端，支持通过 `INGEST_RATE_LIMIT_BACKEND=redis` 使用 `REDIS_URL` 共享 API Key 限流计数；默认仍为 `memory`，保持本地/CI 默认路径稳定。
- 新增 `INGEST_RATE_LIMIT_KEY_PREFIX` 配置，用于 Redis key 前缀隔离；`INGEST_RATE_LIMIT_BACKEND` 仅允许 `memory` 或 `redis`。
- Redis 命令或连接失败时映射为 `503 Service Unavailable`，响应体 `detail=摄入限流服务不可用`，避免变成未处理 500。
- 补充 `redis` Python 依赖、`.env.example`、README 和后端契约草案。
- 新增 fake Redis 单元测试覆盖固定窗口共享计数、窗口切换、禁用时不访问 Redis、Redis 异常映射；补充摄入 API 503 回归测试。

### 阻塞与风险

- 本次不启动真实 Redis 容器；真实 Redis 认证、连接串、网络异常和多进程共享计数需在后续容器补验中覆盖。
- Redis 固定窗口使用 `INCR` + 首次 `EXPIRE`，满足当前基础限流；更强原子性、滑动窗口或 Lua 脚本可在流量压测后补强。

### 验证

- 已运行 `uv run pytest tests/test_config.py tests/test_rate_limit.py tests/test_ingest_api.py`，结果：39 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check . --fix` 修正 import 排序。
- 已运行 `uv run pytest`，结果：103 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：72 个文件已格式化。
- 已运行 `uv run mypy .`，结果：72 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0028 摄入失败统计基础

### 已完成

- 新增 `IngestRepository.record_rejected()` 和 `IngestService.record_rejected()`，按当前分钟桶、项目、API Key、kind 和 source 聚合累加 `rejected_count`。
- API Key 验证成功后会把可信 context 保存到 request state；请求体验证失败时，FastAPI validation handler 会按 ingest 路径记录 rejected 统计。
- 摄入 API Key 限流拒绝时记录 rejected 统计，并保持原有 `429` 和 `Retry-After` 响应契约。
- 缺失、无效或撤销 API Key 的请求仍不统计，避免在缺少可信项目/API Key 维度时引入可枚举或伪造归属风险。
- 更新 README 和后端契约草案，记录 rejected 统计覆盖范围和剩余边界。
- 补充回归测试覆盖请求体验证失败、限流拒绝会累加 `rejected_count`，以及无效 API Key 不产生统计。

### 阻塞与风险

- 限流拒绝发生在请求体解析前，当前按 `event` 维度记录；metrics/logs 的限流拒绝精确 kind 可在后续通过路径感知依赖补强。
- 失败统计仍写入关系库，不同步 ClickHouse；真实 MySQL 并发更新后续补验。

### 验证

- 已运行 `uv run pytest tests/test_ingest_api.py`，结果：27 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run mypy .`，结果：72 个源文件无类型错误。
- 已运行 `uv run pytest`，结果：106 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff format --check .`，结果：72 个文件已格式化。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0029 事件查询 API 基础

### 已完成

- 新增 `GET /api/v1/query/events` 事件查询 API，使用 Bearer 用户 token 鉴权。
- 新增 `SqlAlchemyQueryRepository`、`QueryService` 和 `EventQueryResponse`，当前从关系库 `ingest_records` 的 `kind=event` 记录查询。
- 支持 `project_id`、`type`、`source`、`occurred_from`、`occurred_to` 和 `limit` 查询参数，并按 `received_at`、`id` 倒序返回。
- 普通用户只能查询自己有项目角色的事件；未显式指定项目时仅返回可访问项目，显式查询无权项目返回 `404 项目不存在`。
- 更新 README 和后端契约草案，登记 API-0014 和当前验证边界。
- 新增 `backend/tests/test_query_api.py`，覆盖摄入后事件查询、筛选、跨项目隐藏和未登录拒绝。

### 阻塞与风险

- 当前查询来源仍是关系库 `ingest_records`，不接 ClickHouse/MongoDB；游标分页、全文搜索、复杂聚合和 metrics/logs 查询后续单独推进。
- 真实 MySQL 查询性能、时间索引和大数据量行为后续补验。

### 验证

- 已运行 `uv run pytest tests/test_query_api.py`，结果：3 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run pytest`，结果：109 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：77 个文件已格式化。
- 已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0030 日志查询 API 基础

### 已完成

- 新增 `GET /api/v1/query/logs` 日志查询 API，使用 Bearer 用户 token 鉴权。
- 扩展 `SqlAlchemyQueryRepository`、`QueryService` 和查询响应 schema，当前从关系库 `ingest_records` 的 `kind=log` 记录查询。
- 支持 `project_id`、`level`、`source`、`occurred_from`、`occurred_to` 和 `limit` 查询参数，并按 `received_at`、`id` 倒序返回。
- 普通用户只能查询自己有项目角色的日志；未显式指定项目时仅返回可访问项目，显式查询无权项目返回 `404 项目不存在`。
- 查询响应从日志 JSON 载荷中展开 `message`、`logger`、`trace_id`、`span_id`、`attributes` 和业务 `payload`。
- 更新 README 和后端契约草案，登记 API-0015 和当前验证边界。
- 扩展 `backend/tests/test_query_api.py`，覆盖摄入后日志查询、筛选、跨项目隐藏和未登录拒绝。

### 阻塞与风险

- 当前查询来源仍是关系库 `ingest_records`，不接 ClickHouse；关键词搜索、上下文查看、游标分页、字段过滤和脱敏后续单独推进。
- 真实 MySQL 查询性能、时间索引和大数据量行为后续补验。

### 验证

- 已运行 `uv run pytest tests/test_query_api.py`，结果：6 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：77 个文件已格式化。
- 已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- 已运行 `uv run pytest`，结果：112 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-21 T-0031 指标查询 API 基础

### 已完成

- 新增 `GET /api/v1/query/metrics` 指标查询 API，使用 Bearer 用户 token 鉴权。
- 扩展 `SqlAlchemyQueryRepository`、`QueryService` 和查询响应 schema，当前从关系库 `ingest_records` 的 `kind=metric` 记录查询。
- 支持 `project_id`、`name`、`source`、`occurred_from`、`occurred_to` 和 `limit` 查询参数，并按 `received_at`、`id` 倒序返回。
- 普通用户只能查询自己有项目角色的指标；未显式指定项目时仅返回可访问项目，显式查询无权项目返回 `404 项目不存在`。
- 查询响应从指标 JSON 载荷中展开 `value`、`unit`、`type`、`tags` 和业务 `payload`。
- 更新 README 和后端契约草案，登记 API-0016 和当前验证边界。
- 扩展 `backend/tests/test_query_api.py`，覆盖摄入后指标查询、筛选、跨项目隐藏和未登录拒绝。

### 阻塞与风险

- 当前查询来源仍是关系库 `ingest_records`，不接 ClickHouse；聚合窗口、group by、Top N、降采样和多序列对比后续单独推进。
- 真实 MySQL 查询性能、时间索引和大数据量行为后续补验。

### 验证

- 已运行 `uv run pytest tests/test_query_api.py`，结果：9 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `uv run ruff check . --fix`，修正查询 service import 排序。
- 已运行 `uv run ruff check .`，结果：通过。
- 已运行 `uv run ruff format --check .`，结果：77 个文件已格式化。
- 已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- 已运行 `uv run pytest`，结果：115 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。

## 2026-06-22 T-0034 后端查询结果分页基础

### 已完成

- 为 `GET /api/v1/query/events`、`GET /api/v1/query/logs`、`GET /api/v1/query/metrics` 增加最小游标分页能力。
- 三类查询响应统一调整为 envelope：`{"items": [...], "next_cursor": string | null}`；无更多数据时 `next_cursor=null`。
- 保留既有 `limit`、筛选参数、项目权限过滤和无权项目 `404 项目不存在` 行为，并新增可选 `cursor` 查询参数。
- 游标由查询类型、`received_at` 和 `id` 编码生成，查询继续使用 `received_at`、`id` 倒序，避免同一接收时间记录翻页重复或漏项。
- 非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`，不暴露内部解码细节。
- 查询仍只使用关系库 `ingest_records`，未引入 ClickHouse/MongoDB 查询。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，同步 API-0014、API-0015、API-0016 的 envelope、`cursor`、`next_cursor` 与错误边界。
- 扩展 `backend/tests/test_query_api.py`，覆盖统一 envelope、同一 `received_at` 下基于 `id` 的稳定翻页、坏游标、跨查询类型游标和不匹配筛选条件游标拒绝。
- 已启动测试 agent `McClintock` 对 T-0034 查询分页后端做独立验证；独立复验确认查询分页相关测试、全量 pytest、mypy 和 `git diff --check` 通过，并发现 ruff/format 问题；后端开发侧修复后，`McClintock` 复跑 `uv run ruff check .` 和 `uv run ruff format --check .` 均通过，确认问题关闭。

### 阻塞与风险

- 暂无阻塞。
- 本次分页仍基于关系库 `ingest_records`；真实 MySQL 大数据量性能、组合索引策略和 ClickHouse/MongoDB 专用查询链路仍需测试 agent 在后续真实服务/集成环境补验。
- 响应从裸数组调整为统一 envelope，前端需按 T-0034 契约读取 `items` 与 `next_cursor`。
- 按最新职责边界，后端开发侧验证收窄为实现必要的快速自检；本次在边界修正前已运行过较完整的开发自检命令，后续完整测试矩阵仍以测试 agent 独立复验为准。

### 下一步

- 等待总 agent 后续启动代码审计 agent。
- 后续在真实 MySQL 或专用查询存储接入时补充分页性能、索引和跨页一致性专项验证。

### 开发侧验证

- 快速冒烟：已运行 `uv run pytest tests/test_query_api.py`，结果：12 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 边界修正前的开发自检：已运行 `uv run pytest`，结果：118 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 边界修正前的开发自检：已运行 `uv run ruff check .`，结果：通过。
- 边界修正前的开发自检：已运行 `uv run ruff format --check .`，结果：通过。
- 边界修正前的开发自检：已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- 边界修正前的开发自检：已运行 `git diff --check`，结果：通过。

### 测试 agent 独立复验

- `McClintock` 已运行 `uv run pytest tests/test_query_api.py`，结果：12 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- `McClintock` 已运行 `uv run pytest`，结果：118 个测试通过、2 个真实 MySQL 用例因未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 跳过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- `McClintock` 已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- `McClintock` 已运行 `git diff --check`，结果：通过。
- `McClintock` 首轮发现 `app/services/query.py` 的 ruff/format 问题；开发侧修复后，`McClintock` 复跑 `uv run ruff check .` 和 `uv run ruff format --check .`，结果均通过。
- 剩余风险：logs/metrics 依赖同一分页实现路径，当前没有各自同时间戳翻页专项用例；真实 MySQL 大数据量、索引和性能边界未验证。

## 2026-06-22 T-0036 查询分页测试缺口补齐

### 已完成

- 在 `backend/tests/test_query_api.py` 补齐 logs 与 metrics 同一 `received_at` 下按 `id` 稳定游标翻页的专项回归测试。
- 新增测试复用 `set_ingest_records_received_at()` helper，将指定项目和摄入类型的记录固定到同一接收时间，避免重复手写数据库调整逻辑。
- logs 分页用例带 `level=info` 和 `source=app` 筛选，并插入不同 level/source 的干扰记录，验证筛选条件和游标翻页同时生效。
- metrics 分页用例带 `name=stable.metric` 和 `source=api` 筛选，并插入不同 name/source 的干扰记录，验证指标路由筛选接线和同时间戳翻页稳定性。
- 未修改业务实现、API 契约、迁移、README、根 `AGENT_COMMUNICATION.md` 或根 `PROJECT_PROGRESS.md`。

### 阻塞与风险

- 暂无阻塞。
- 本轮是测试缺口补齐，不改变查询行为；真实 MySQL 大数据量分页性能、组合索引和专用查询存储仍属于后续集成/性能验证范围。
- 开发侧按职责边界只运行最小自检；完整后端测试矩阵未在本轮开发侧执行。
- `uv run pytest tests/test_query_api.py` 仍有 1 条 FastAPI/Starlette TestClient 上游弃用警告，不影响本次验证通过。

### 下一步

- 由总 agent 后续按项目流程决定是否启动代码审计 agent，或将 `feature/backend-dev` 合并入 `dev`。
- 后续真实 MySQL 或专用查询存储接入时，继续补充分页性能、索引和跨页一致性专项验证。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py`，结果：14 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `git diff --check`，结果：通过。

### 测试 agent 独立复验

- 已启动测试 agent `Peirce` 做独立复验，结论：通过。
- `Peirce` 已确认当前分支为 `feature/backend-dev`，复验前后改动范围均仅有 `backend/tests/test_query_api.py` 未暂存改动。
- `Peirce` 已运行 `uv run pytest tests/test_query_api.py`，结果：14 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- `Peirce` 已运行 `git diff --check`，结果：通过。
- `Peirce` 已运行 `uv run ruff check tests/test_query_api.py`，结果：通过。

## 2026-06-22 T-0036 CI Ruff format 修复

### 已完成

- 修复 GitHub Actions run `27921581718` 暴露的 `backend/tests/test_query_api.py` ruff format 差异。
- 仅调整测试断言换行格式，未修改业务实现、API 契约、根文档或其他后端代码。

### 阻塞与风险

- 暂无阻塞。
- 本轮只处理 CI format failure；完整后端测试矩阵仍由测试 agent 或后续流程按需执行。

### 开发侧验证

- 已运行 `uv run ruff format --check tests/test_query_api.py`，结果：通过。
- 已运行 `uv run pytest tests/test_query_api.py`，结果：14 个测试通过、1 条 FastAPI/Starlette TestClient 上游弃用警告。
- 已运行 `git diff --check`，结果：通过。

## 2026-06-22 T-0038 日志上下文后端基础

### 已完成

- 新增 `GET /api/v1/query/logs/{log_id}/context`，使用 Bearer 用户 token 鉴权。
- 在 API/service/repository/schema 分层内实现最小日志上下文查询：目标日志按 `id` 读取并校验 `kind=log`，当前用户必须拥有目标日志所属项目角色。
- 上下文限定同一 `project_id` 且 `kind=log`，不要求同 `source` 或 `level`，不跨项目，不包含 events/metrics。
- `before` 与 `after` 查询参数默认均为 `5`，范围 `0..20`；响应为 `target`、`before`、`after`，两侧上下文均按 `received_at` + `id` 时间正序返回，便于前端按 `before + target + after` 展示。
- 目标不存在、不是日志或当前用户无项目权限时统一返回 `404 日志不存在`，避免通过日志 ID 探测跨项目数据。
- 扩展 `backend/tests/test_query_api.py`，覆盖成功返回目标前后文、同时间戳下按 `id` 稳定排序、同项目但不同 source/level 纳入上下文、其他项目/events/metrics 不纳入、无权限/不存在隐藏，以及 `before`/`after` 边界校验。
- 更新 `backend/README.md` 和 `agents/runtime/api-contracts/backend.md`，登记日志上下文 API 路径、权限、响应、排序和错误边界。

### 阻塞与风险

- 暂无阻塞。
- 本轮仍基于关系库 `ingest_records`；真实 MySQL 大数据量窗口性能、组合索引策略、ClickHouse 日志上下文、全文搜索窗口和生产反代路径未覆盖。
- 开发侧仅做收窄自检；未启动后端服务，未做完整前后端联测。

### 下一步

- 等待总 agent 后续启动代码审计 agent。
- 前端可按 API 契约接入日志详情上下文展示；若后续接入 ClickHouse 日志存储，再补专用上下文查询与性能验证。

### 开发侧验证

- 已运行 `uv run pytest tests/test_query_api.py -k "log_context"`，结果：3 个测试通过、14 个测试 deselected、1 条 FastAPI/Starlette TestClient 上游弃用警告。

### 测试 agent 独立复验

- 已启动测试 agent `Goodall` 做独立复验，结论：有条件通过。
- `Goodall` 已运行 `uv run pytest tests/test_query_api.py -k "log_context"`，结果：3 个测试通过。
- `Goodall` 已运行 `uv run pytest tests/test_query_api.py`，结果：17 个测试通过。
- `Goodall` 已运行 `uv run ruff check app/api/routes/query.py app/services/query.py app/repositories/query.py app/schemas/query.py tests/test_query_api.py`，结果：通过。
- `Goodall` 已运行 `uv run ruff format --check app/api/routes/query.py app/services/query.py app/repositories/query.py app/schemas/query.py tests/test_query_api.py`，结果：通过。
- `Goodall` 已运行 `uv run mypy .`，结果：77 个源文件无类型错误。
- `Goodall` 首轮指出文档和契约尚未更新；开发侧随后已补齐 `backend/README.md`、`backend/PROJECT_PROGRESS.md` 和 `agents/runtime/api-contracts/backend.md`。
