# 后端 API 契约草案

后端开发 agent 在本文件追加或修订后端实际提供的 API 契约草案。总 agent 负责合并到 `AGENT_COMMUNICATION.md` 的正式契约表。

## API-0001 后端健康检查

- task: T-0003
- owner: backend-agent
- method: GET
- path: `/health`
- request: 无请求体
- response:
  - `status`: 固定为 `ok`
  - `service`: 服务名称
  - `version`: 后端版本
  - `environment`: 运行环境
  - `port`: 后端监听端口
- auth: 无
- status: done

## API-0002 项目管理

- task: T-0006
- owner: backend-agent
- status: done

- 方法：`GET`
- 路径：`/api/v1/projects`
- 权限：阶段 1 临时开放；后续接入认证后要求管理后台登录态和项目读取权限。
- 查询参数：暂无。
- 分页：暂无；当前内存版返回全部项目，MySQL 版本替换时再补 `page`、`page_size` 或游标分页。
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

- task: T-0006
- owner: backend-agent
- status: done

- 方法：`GET`
- 路径：`/api/v1/environments`
- 权限：阶段 1 临时开放；后续接入认证后要求项目读取权限。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下环境。
- 分页：暂无；当前内存版返回全部匹配环境。
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
  - `422 Unprocessable Entity`：请求体字段格式错误。

## API-0004 服务管理

- task: T-0006
- owner: backend-agent
- status: done

- 方法：`GET`
- 路径：`/api/v1/services`
- 权限：阶段 1 临时开放；后续接入认证后要求项目或环境读取权限。
- 查询参数：
  - `project_id`：可选，正整数；传入后只返回该项目下服务。
  - `environment_id`：可选，正整数；传入后只返回该环境下服务。
- 分页：暂无；当前内存版返回全部匹配服务。
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
  - `422 Unprocessable Entity`：请求体字段格式错误。

## 临时实现与替换点

- 当前实现位于 `backend/app/repositories/management.py`，使用进程内 `InMemoryManagementRepository`。
- 临时原因：`T-0006` 目标是先固定 API 契约和前端联调面，阶段 1 后续任务再接入 MySQL migration、SQLAlchemy model 和持久化 repository。
- MySQL 替换点：新增 SQLAlchemy model 与迁移后，用 MySQL repository 替换 `InMemoryManagementRepository`，并保持 `ManagementService`、Pydantic schema 和路由响应契约稳定。
- 安全边界：当前接口不接收密钥、Token、Cookie、数据库连接串或通知 Webhook 等敏感字段；代码未输出请求体日志，避免明文敏感日志。
