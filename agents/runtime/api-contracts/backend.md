# 后端 API 契约草案

本文件由后端开发 agent 维护，供总 agent 汇总到 `AGENT_COMMUNICATION.md`。当前草案对应 `T-0008-fix`：阶段 1 基础管理 API 的 MySQL/SQLAlchemy 持久化基础与审计修复。API 路径、请求体、响应体和错误码延续 `T-0006`，本次主要变更为 repository、迁移约束和完整性错误映射。

## API-0002 项目管理

- 方法：`GET`
- 路径：`/api/v1/projects`
- 权限：阶段 1 临时开放；后续接入认证后要求管理后台登录态和项目读取权限。
- 查询参数：暂无。
- 分页：暂无；当前 SQLAlchemy repository 返回全部项目，后续数据量上来后补 `page`、`page_size` 或游标分页。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "name": "核心平台",
    "key": "core-platform",
    "description": "主项目",
    "status": "active",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/projects`
- 权限：阶段 1 临时开放；后续接入认证后要求项目创建权限。
- 请求体：

```json
{
  "name": "核心平台",
  "key": "core-platform",
  "description": "主项目",
  "status": "active"
}
```

- 字段规则：
  - `name`：必填，1 到 100 字符，首尾空白会裁剪。
  - `key`：必填，2 到 64 字符，匹配 `^[a-z][a-z0-9_-]*$`，全局唯一。
  - `description`：可选，最多 500 字符。
  - `status`：可选，`active`、`inactive`、`archived`，默认 `active`。
- 响应：`201 Created`，返回创建后的项目对象。
- 错误：
  - `409 Conflict`：项目 `key` 已存在。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## API-0003 环境管理

- 方法：`GET`
- 路径：`/api/v1/environments`
- 权限：阶段 1 临时开放；后续接入认证后要求项目读取权限。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下环境。
- 分页：暂无；当前 SQLAlchemy repository 返回全部匹配环境。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "project_id": 1,
    "name": "生产环境",
    "key": "prod",
    "description": null,
    "status": "active",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/environments`
- 权限：阶段 1 临时开放；后续接入认证后要求项目环境管理权限。
- 请求体：

```json
{
  "project_id": 1,
  "name": "生产环境",
  "key": "prod",
  "description": null,
  "status": "active"
}
```

- 字段规则：
  - `project_id`：必填，正整数，必须引用已存在项目。
  - `name`、`key`、`description`、`status`：同项目字段规则。
  - `key`：在同一个 `project_id` 下唯一。
- 响应：`201 Created`，返回创建后的环境对象。
- 错误：
  - `404 Not Found`：项目不存在。
  - `409 Conflict`：同项目下环境 `key` 已存在。
  - `409 Conflict`：其他无法归类为重复 key 或缺失项目的数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## API-0004 服务管理

- 方法：`GET`
- 路径：`/api/v1/services`
- 权限：阶段 1 临时开放；后续接入认证后要求项目或环境读取权限。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下服务。
  - `environment_id`：可选，正整数；传入后只返回该环境下服务。
- 分页：暂无；当前 SQLAlchemy repository 返回全部匹配服务。
- 响应：`200 OK`

```json
[
  {
    "id": 1,
    "project_id": 1,
    "environment_id": 1,
    "name": "API 服务",
    "key": "api-service",
    "description": null,
    "status": "inactive",
    "created_at": "2026-06-20T12:00:00Z"
  }
]
```

- 方法：`POST`
- 路径：`/api/v1/services`
- 权限：阶段 1 临时开放；后续接入认证后要求服务管理权限。
- 请求体：

```json
{
  "project_id": 1,
  "environment_id": 1,
  "name": "API 服务",
  "key": "api-service",
  "description": null,
  "status": "active"
}
```

- 字段规则：
  - `project_id`：必填，正整数，必须引用已存在项目。
  - `environment_id`：必填，正整数，必须引用已存在环境。
  - `environment_id` 所属项目必须等于 `project_id`。
  - `name`、`key`、`description`、`status`：同项目字段规则。
  - `key`：在同一个 `environment_id` 下唯一。
- 响应：`201 Created`，返回创建后的服务对象。
- 错误：
  - `404 Not Found`：项目或环境不存在。
  - `409 Conflict`：环境所属项目不匹配，或同环境下服务 `key` 已存在。
  - `409 Conflict`：其他无法归类为重复 key、缺失项目/环境或归属冲突的数据库完整性约束错误。
  - `422 Unprocessable Entity`：请求体字段格式错误。

## 持久化实现与迁移

- 当前实现位于 `backend/app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`。
- 请求级数据库 session 由 `backend/app/api/dependencies.py` 注入，engine/session factory 在 `backend/app/core/application.py` 创建。
- 配置项：`DATABASE_URL`，默认 `sqlite:///./telemetry-dev.db`；MySQL 使用 `mysql+pymysql://...?...charset=utf8mb4`。
- Alembic 迁移：`backend/migrations/versions/20260620_0001_create_management_tables.py`。
- MySQL 目标表：
  - `management_projects`：项目，`key` 全局唯一。
  - `management_environments`：环境，外键 `project_id`，同项目下 `key` 唯一，并提供 `(id, project_id)` 唯一约束供服务复合外键引用。
  - `management_services`：服务，外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键保证服务引用的环境属于同一项目，同环境下 `key` 唯一。
- 表字符集：MySQL `utf8mb4` / `utf8mb4_unicode_ci`。
- Repository 完整性错误映射：唯一约束按具体约束映射为重复 key；外键约束按缺失项目、缺失环境或服务项目/环境归属冲突映射；无法识别的 `IntegrityError` 返回通用数据库完整性冲突，不再伪装为重复 key。
- 验证边界：当前 worktree 无真实 MySQL 运行时，已用 SQLite 覆盖 API 契约、唯一约束错误映射、服务项目/环境复合外键归属约束、未知 `IntegrityError` 映射和 Alembic 升降级；后续需要 MySQL 容器补验 migration、外键、唯一索引和 API 集成。
- 安全边界：当前接口仍未接入认证/权限；不接收密钥、Token、Cookie、数据库连接串或通知 Webhook 等敏感字段；代码未输出请求体日志，避免明文敏感日志。
