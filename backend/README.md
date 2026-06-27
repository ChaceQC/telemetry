# 遥测后端

本目录是遥测平台后端服务，当前阶段提供 Python + uv + FastAPI 基础骨架、配置读取、健康检查接口、阶段 1 基础管理 API 的 SQLAlchemy 持久化基础、认证/当前用户依赖、项目级 RBAC 基础、项目范围 API Key 创建/列表/撤销基础、阶段 2 events/metrics/logs/traces 摄入 API 基础、阶段 3 events/logs/metrics 查询 API 与日志上下文 API 基础、阶段 4 traces 查询与服务拓扑最小后端基础、阶段 5 dashboard CRUD 后端基础、panel config schema 最小校验、dashboard 全局 `time_range` 最小保存校验、已保存 panel 查询预览 API 与 preview 执行前变量默认值替换、内置 dashboard template 列表/读取/从模板创建基础、单个 dashboard JSON 导入导出基础、阶段 6 告警规则 CRUD、指标阈值告警手动评估和告警周期评估当前状态持久化后端骨架，以及浏览器联调所需的 CORS、Trusted Host、反向代理 root path 配置入口。

## 环境要求

- Python 3.12+
- uv

## 本地启动

在 `backend` 目录执行：

```powershell
uv run python main.py
```

默认监听端口来自环境变量，未设置时使用项目约定端口 `28117`。

常用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BACKEND_PORT` | `28117` | 后端 HTTP 监听端口 |
| `PORT` | `28117` | 兼容部署平台的端口变量，优先级低于 `BACKEND_PORT` |
| `BACKEND_HOST` | `127.0.0.1` | 后端监听地址 |
| `APP_ENV` | `local` | 运行环境标识 |
| `APP_NAME` | `telemetry-backend` | 应用名称 |
| `APP_VERSION` | 读取 `VERSION` | 应用版本 |
| `BACKEND_RELOAD` | `false` | 是否启用 uvicorn reload |
| `LOG_LEVEL` | `info` | uvicorn 日志级别 |
| `BACKEND_CORS_ALLOWED_ORIGINS` | 本地/测试环境默认 `http://127.0.0.1:25173,http://localhost:25173,http://127.0.0.1:25174,http://localhost:25174`，其他环境默认空 | 允许跨域访问后端的前端 origin，逗号分隔；生产必须显式配置为真实 HTTPS origin |
| `CORS_ALLOWED_ORIGINS` | 同上 | `BACKEND_CORS_ALLOWED_ORIGINS` 的兼容别名，优先级较低 |
| `BACKEND_CORS_ALLOWED_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | CORS 允许方法，逗号分隔 |
| `BACKEND_CORS_ALLOWED_HEADERS` | `Authorization,X-API-Key,Content-Type,Accept,Origin` | CORS 允许请求头，逗号分隔 |
| `BACKEND_CORS_ALLOW_CREDENTIALS` | `false` | 是否允许跨域携带凭据；当前 bearer token 推荐保持 `false`，且为 `true` 时禁止将 CORS origin 配置为 `*` |
| `BACKEND_TRUSTED_HOSTS` | 本地/测试环境默认 `localhost,127.0.0.1,[::1],testserver`，其他环境默认 `localhost,127.0.0.1` | Trusted Host 白名单，逗号分隔；生产必须加入公网域名和反代传给后端的 Host |
| `TRUSTED_HOSTS` | 同上 | `BACKEND_TRUSTED_HOSTS` 的兼容别名，优先级较低 |
| `BACKEND_ROOT_PATH` | 空 | FastAPI `root_path`，仅在后端被挂载到反向代理子路径时设置，例如 `/xxx` |
| `ROOT_PATH` | 空 | `BACKEND_ROOT_PATH` 的兼容别名，优先级较低 |
| `BACKEND_PROXY_HEADERS` | `false` | 是否信任反向代理转发的 `X-Forwarded-*` 头；生产经 Nginx HTTPS 反代时建议开启 |
| `BACKEND_FORWARDED_ALLOW_IPS` | `127.0.0.1` | 允许设置转发头的代理来源 IP，传给 uvicorn `forwarded_allow_ips` |
| `DATABASE_URL` | `sqlite:///./telemetry-dev.db` | SQLAlchemy 数据库连接；MySQL 使用 `mysql+pymysql://...?...charset=utf8mb4` |
| `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT` | `10000` | Trace 服务拓扑在数据库侧最多读取的 span 数；接口 `limit` 仅限制返回节点数 |
| `INGEST_RATE_LIMIT_ENABLED` | `false` | 是否启用摄入 API Key 固定窗口限流 |
| `INGEST_RATE_LIMIT_PER_MINUTE` | `600` | 每个 API Key 每分钟允许的摄入请求数；超限返回 `429` 和 `Retry-After` |
| `INGEST_RATE_LIMIT_BACKEND` | `memory` | 限流后端，支持 `memory` 或 `redis`；多实例部署应使用 `redis` |
| `INGEST_RATE_LIMIT_KEY_PREFIX` | `telemetry` | Redis 限流 key 前缀 |
| `REDIS_URL` | `redis://127.0.0.1:26380/0` | Redis 连接地址；启用 `INGEST_RATE_LIMIT_BACKEND=redis` 时使用 |
| `CLICKHOUSE_HOST` | `127.0.0.1` | 本地 ClickHouse 宿主机绑定地址 |
| `CLICKHOUSE_HTTP_PORT` | `28123` | 本地 ClickHouse HTTP 端口，映射容器 `8123` |
| `CLICKHOUSE_NATIVE_PORT` | `29001` | 本地 ClickHouse Native 端口，映射容器 `9000` |
| `CLICKHOUSE_DATABASE` | `telemetry` | ClickHouse 初始化数据库名 |
| `CLICKHOUSE_USER` | `telemetry_app` | ClickHouse 本地开发用户 |
| `CLICKHOUSE_PASSWORD` | `change-me` | ClickHouse 本地开发密码占位；真实环境必须替换且不得提交 |
| `AUTH_SECRET_KEY` | 未设置 | JWT 签名密钥；未设置或少于 32 个 UTF-8 字节时认证接口返回 `503`，生产环境必须使用 32 字节以上随机密钥 |
| `AUTH_TOKEN_ALGORITHM` | `HS256` | JWT 签名算法 |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | 访问 token 有效期，单位分钟 |

示例：

```powershell
$env:BACKEND_PORT='28117'
uv run python main.py
```

## 浏览器联调与反向代理

本地前端默认从 `http://127.0.0.1:25173` 调用后端 `http://127.0.0.1:28117`。`APP_ENV=local` 或 `APP_ENV=test` 且未显式配置 `BACKEND_CORS_ALLOWED_ORIGINS` 时，后端默认允许项目约定的本地前端 origin，并处理 `OPTIONS /api/v1/auth/login` 等浏览器 preflight 请求。

非本地环境默认不开放 CORS origin，避免生产忘配白名单时意外放开跨域。生产部署至少应配置：

```powershell
$env:APP_ENV='production'
$env:BACKEND_CORS_ALLOWED_ORIGINS='https://example.com'
$env:BACKEND_TRUSTED_HOSTS='example.com'
$env:BACKEND_PROXY_HEADERS='true'
$env:BACKEND_FORWARDED_ALLOW_IPS='127.0.0.1'
```

如果同一域名下同时承载前端和 API，且浏览器请求最终 origin 为 `https://example.com`，CORS origin 只需要配置 scheme + host + port，不包含路径。
如需开启跨域凭据，必须配置明确 origin 白名单；后端会拒绝 `BACKEND_CORS_ALLOWED_ORIGINS=*` 与 `BACKEND_CORS_ALLOW_CREDENTIALS=true` 的组合。

### 子路径部署策略

推荐生产路径策略是：前端部署在 `https://example.com/xxx/` 时，API 仍由 Nginx 暴露为独立前缀，例如 `https://example.com/api/v1/...`，后端保持 `BACKEND_ROOT_PATH` 为空，前端通过配置使用 `/api/v1` 作为 API base path。

如果必须把整个后端挂到子路径，例如公网访问为 `https://example.com/xxx/api/v1/...`，则需要同时满足：

- 后端设置 `BACKEND_ROOT_PATH=/xxx`。
- Nginx 公网入口匹配 `/xxx/api/v1/...` 后，应剥离或映射 `/xxx` 前缀，转发给后端实际路由 `/api/v1/...`；不要把 `/xxx` 原样留给后端路由匹配。
- ASGI scope 使用 `root_path=/xxx`，OpenAPI、Swagger UI 和客户端生成工具以 `/xxx` 作为服务器前缀；实际接口路由仍是代码中的 `/api/v1/...`。

Nginx 应继续把 `Host`、`X-Forwarded-Proto`、`X-Forwarded-For` 等头转给后端，并确保 `BACKEND_TRUSTED_HOSTS` 包含公网域名。真实域名、证书路径和密钥不得提交到仓库，应通过环境变量或部署平台配置注入。

## 数据库迁移

当前管理元数据已接入 SQLAlchemy 2.x、Alembic 和 PyMySQL。应用启动不会自动创建表，本地开发或部署前需要在 `backend` 目录执行迁移：

```powershell
uv run alembic upgrade head
```

默认 `DATABASE_URL` 使用本地 SQLite 文件，仅用于无 MySQL 运行时时的开发兜底和迁移链路验证。连接 MySQL 时示例：

```powershell
$env:DATABASE_URL='mysql+pymysql://telemetry:telemetry@127.0.0.1:3306/telemetry?charset=utf8mb4'
uv run alembic upgrade head
uv run python main.py
```

当前迁移创建以下表：

| 表 | 说明 | 关键约束 |
| --- | --- | --- |
| `management_projects` | 项目元数据 | `key` 全局唯一 |
| `management_environments` | 环境元数据 | 外键 `project_id`，同项目下 `key` 唯一，`(id, project_id)` 供服务复合外键引用 |
| `management_services` | 服务元数据 | 外键 `project_id`、`environment_id`，`(environment_id, project_id)` 复合外键约束环境归属，同环境下 `key` 唯一 |
| `auth_users` | 本地登录用户 | `username` 唯一，`email` 唯一且可为空，密码仅保存哈希 |
| `rbac_teams` | 团队元数据 | `key` 全局唯一，当前作为团队能力基础表 |
| `rbac_team_members` | 团队成员 | 外键 `team_id`、`user_id`，同团队同用户唯一 |
| `rbac_project_members` | 项目成员角色 | 外键 `project_id`、`user_id`，同项目同用户唯一，角色为 `viewer`、`editor`、`admin` |
| `api_keys` | 项目 API Key | 外键 `project_id`、`created_by_user_id`，`key_hash` 全局唯一；只保存哈希和展示前缀，不保存明文 key |
| `dashboards` | 项目仪表盘 | 外键 `project_id`、`created_by_user_id`、`updated_by_user_id`；保存 `name`、`description`、`layout` JSON、`config` JSON、创建/更新时间；`(project_id, updated_at, id)` 索引支撑项目内列表分页 |
| `alert_rules` | 项目告警规则 | 外键 `project_id`、`created_by_user_id`、`updated_by_user_id`；保存 `name`、`description`、`enabled`、`severity`、`signal`、`condition` JSON、`evaluation` JSON、创建/更新时间；同项目下 `name` 唯一，`(project_id, updated_at, id)` 索引支撑项目内列表分页 |
| `alert_evaluation_states` | 告警当前评估状态 | 外键 `rule_id`、`project_id`；每条规则唯一一条当前状态，保存 `status`、`last_evaluated_at`、`next_evaluate_at`、`last_result` JSON、`last_error` 和更新时间；`(project_id, next_evaluate_at, rule_id)` 索引支撑到期扫描 |
| `ingest_records` | 最小摄入记录 | 外键 `project_id`、`api_key_id`；保存 `kind`、`event_type`、`source`、`payload` JSON、`occurred_at` 和 `received_at`；MySQL/MariaDB 下 `occurred_at` 和 `received_at` 使用 `DATETIME(6)` 保留微秒精度；`(project_id, kind, received_at, id)` 组合索引支撑日志上下文窗口和带项目过滤的查询分页 |

MySQL 表使用 `utf8mb4` 字符集和 `utf8mb4_unicode_ci` 排序规则。`20260622_0008` 迁移会把已有 MySQL/MariaDB `ingest_records.occurred_at` 与 `received_at` 调整为 `DATETIME(6)`，并将 `received_at` 默认值调整为 `CURRENT_TIMESTAMP(6)`；SQLAlchemy 模型在 MySQL/MariaDB 方言下的建表 DDL 也会编译为 `DATETIME(6)` 与 `CURRENT_TIMESTAMP(6)`，SQLite 仍保持 `CURRENT_TIMESTAMP` 以兼容本地测试。`20260623_0009` 新增 `dashboards` 表，MySQL/MariaDB 下 `layout` 和 `config` 使用原生 JSON 列，SQLite 测试路径使用 SQLAlchemy JSON 兼容类型。`20260626_0010` 新增 `alert_rules` 表，MySQL/MariaDB 下 `condition` 和 `evaluation` 使用原生 JSON 列，SQLite 测试路径使用 SQLAlchemy JSON 兼容类型。`20260627_0011` 新增 `alert_evaluation_states` 表，MySQL/MariaDB 下 `last_result` 使用原生 JSON 列，SQLite 测试路径使用 SQLAlchemy JSON 兼容类型。生产建库和升级必须使用 Alembic 迁移，`Base.metadata.create_all()` 仅用于测试或一次性临时库初始化，不作为生产 schema 管理入口。Alembic 生成的 MySQL/MariaDB 离线 SQL 为标准 `ALTER TABLE ... CHANGE ... DATETIME(6)` 语法，兼容 Debian 常见 MySQL 8 和 MariaDB 包。由于 0008 会修改 `received_at` 这个已参与索引的列，真实 MySQL/MariaDB 大表执行前必须评估表规模、锁等待、备份/回滚、复制延迟和维护窗口，必要时先在同版本影子库演练或采用在线 schema 变更工具。当前环境没有真实 MySQL 服务，因此已完成 SQLite 迁移升降级、MySQL DDL 编译和 repository 单元测试；后续接入 MySQL 容器后需要补跑 MySQL migration、外键、唯一索引、JSON 字段和 API 集成验证。

### 真实 MySQL 回归测试

默认测试不要求 MySQL，未设置 `TELEMETRY_MYSQL_TEST_DATABASE_URL` 时真实 MySQL 用例会 `skip`，不会影响普通本地或 CI 的 `uv run pytest`。如本机或测试环境已有可创建/删除数据库的 MySQL 账号，可在 `backend` 目录临时设置：

```powershell
$env:TELEMETRY_MYSQL_TEST_DATABASE_URL='mysql+pymysql://user:password@127.0.0.1:3306/mysql?charset=utf8mb4'
uv run pytest tests/test_management_api.py
```

测试会基于该连接创建随机 `telemetry_test_<uuid>` 临时库，执行 Alembic `upgrade head`，跑完后删除临时库。不要在命令输出、日志或提交内容中记录真实连接串、密码或临时库详情；该环境变量只用于本地/专用测试环境复验，不应配置到默认 CI。

## ClickHouse 本地初始化

项目根目录提供开发用 `docker-compose.dev.yml`，其中 ClickHouse 服务挂载后端初始化 SQL，不启动后端应用。初始化 SQL 位于 `backend/docker/clickhouse/init/01-create-telemetry-tables.sql`，通过 compose 挂载到容器的 `/docker-entrypoint-initdb.d/01-create-telemetry-tables.sql`，新建数据卷首次启动时由 ClickHouse 官方 entrypoint 执行。

初始化脚本会创建 `telemetry` 数据库和阶段 2 需要的基础 MergeTree 表：

| 表 | 说明 | 排序键 |
| --- | --- | --- |
| `metric_samples` | metrics datapoint 明细，保存 `project_id`、`api_key_id`、时间、指标名、数值、单位、类型、source、tags/attributes/payload JSON 字符串 | `(project_id, name, timestamp)` |
| `log_records` | logs 明细，保存 `project_id`、`api_key_id`、时间、level、source、logger、trace/span、message、attributes/payload JSON 字符串 | `(project_id, level, source, timestamp)` |
| `ingest_stats` | 摄入统计预留表，按时间桶保存项目/API Key、kind、source、accepted/rejected 数和字节数 | `(project_id, bucket_start, kind, source)` |
| `trace_spans` | traces 预留表，保存 trace/span 关系、span 名称、起止时间、状态和 JSON 字符串载荷 | `(project_id, trace_id, start_time, name)` |

只检查 compose 配置展开和挂载，不启动容器：

```powershell
docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet
```

真实容器补验需在后续有 Docker 运行环境时执行：启动 ClickHouse、确认 init SQL 只在新数据卷首次执行、用配置中的非默认端口连接、查询四张表存在，并复验后续 writer 写入 metrics/logs/stats/traces 的字段映射。

## MongoDB 本地初始化

项目根目录的 `docker-compose.dev.yml` 会将 `docker/mongodb/init-app-user.js` 挂载到 MongoDB 容器的 `/docker-entrypoint-initdb.d/10-init-app-user.js`。脚本在新数据卷首次初始化时创建应用读写用户，并初始化 `events` 集合和基础索引：

| 索引 | 字段 | 说明 |
| --- | --- | --- |
| `idx_events_project_occurred_at` | `project_id`、`occurred_at` | 项目内按事件时间查询 |
| `idx_events_project_env_service_time` | `project_id`、`environment_id`、`service_id`、`occurred_at` | 项目/环境/服务组合查询 |
| `idx_events_type_occurred_at` | `event_type`、`occurred_at` | 按事件类型查找 |
| `idx_events_expires_at_ttl` | `expires_at` | 可选临时事件 TTL，`expireAfterSeconds=0` |

只检查 compose 配置展开和挂载，不启动容器：

```powershell
docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet
uv run pytest tests/test_mongodb_init.py
```

真实容器补验需在后续有 Docker 运行环境时执行：启动 MongoDB、确认初始化脚本在新数据卷首次执行、应用用户可登录、`events` 集合和四个索引存在，并复验后续 events writer 的字段映射。

## 健康检查

```http
GET /health
```

当前接口不需要认证、请求体或查询参数，用于本地开发、容器编排和反向代理的基础可用性探测。

响应示例：

```json
{
  "status": "ok",
  "service": "telemetry-backend",
  "version": "0.5.0",
  "environment": "local",
  "port": 28117
}
```

字段契约：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 固定为 `ok` |
| `service` | string | 当前服务名，默认 `telemetry-backend` |
| `version` | string | 当前后端版本，默认读取 `backend/VERSION` |
| `environment` | string | 当前运行环境，来自 `APP_ENV` |
| `port` | number | 当前后端监听端口 |

## 认证 API

当前认证基础使用本地 `auth_users` 表、`pwdlib[argon2]` 密码哈希和 `PyJWT` 访问 token。后端已提供可复用的 `get_current_user` 依赖，并已将项目、环境和服务管理 API 接入项目级 RBAC 基础：请求必须携带有效 Bearer token，且 token 对应用户必须处于启用状态；普通用户还需要对应项目角色，超级用户可绕过项目角色检查。

接口不会在响应中返回 `password`、`password_hash` 或 token payload 详情。代码当前不输出请求体日志，后续引入结构化访问日志时也必须脱敏密码、token、cookie、API Key 和数据库连接串。

登录接口保持 JSON 请求体契约，不使用 OAuth2 password form。OpenAPI 对受保护接口仅声明 HTTP Bearer token；客户端应在请求头中传入 `Authorization: Bearer <access_token>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | 使用用户名和密码登录，返回 bearer access token |
| `GET` | `/api/v1/auth/me` | 读取当前访问 token 对应用户 |

登录请求示例：

```json
{
  "username": "admin",
  "password": "change-me"
}
```

登录响应示例：

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600
}
```

当前用户响应示例：

```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.test",
  "display_name": "管理员",
  "is_active": true,
  "is_superuser": true,
  "created_at": "2026-06-20T12:00:00Z"
}
```

错误边界：

| 状态码 | 场景 |
| --- | --- |
| `401` | 用户名或密码错误、token 缺失、token 无效、token 过期、token 对应用户不存在 |
| `403` | 已认证但缺少项目权限，例如普通用户访问未授权项目，或 `viewer` 尝试创建环境/服务 |
| `503` | `AUTH_SECRET_KEY` 未配置或少于 32 个 UTF-8 字节，认证服务不可用 |
| `422` | 请求体字段格式错误 |

登录失败统一返回 `用户名或密码错误`；账号不存在、密码错误和停用账号不会返回可区分文案。账号不存在时服务端仍执行固定 Argon2 dummy hash 校验，减少用户名枚举时序差异。当前没有开放用户注册或管理员创建用户 API；测试和后续初始化脚本可以通过 `SqlAlchemyAuthRepository.create_user()` 与 `hash_password()` 创建初始账号。用户管理、团队管理和角色分配 API 仍需后续补齐。

## 基础管理 API

当前阶段提供项目、环境和服务管理接口，API 契约延续 T-0006；数据访问已从进程内内存仓储切换为请求级 SQLAlchemy repository。接口暂不接收密钥、Token、Cookie、数据库连接串或通知 Webhook 等敏感字段，也不输出请求体日志。

以下管理接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。项目级 RBAC 已接入服务层，超级用户可访问和管理全部项目；普通用户只能读取自己拥有项目权限的资源。创建项目时，项目记录和创建者 `admin` 成员授权在同一事务内提交，任一写入失败都会整体回滚。

项目角色当前定义：

| 角色 | 权限 |
| --- | --- |
| `viewer` | 可读取项目、环境和服务，不能创建环境或服务 |
| `editor` | 包含 `viewer`，可创建环境和服务 |
| `admin` | 包含 `editor`，当前可管理项目内环境和服务，后续危险动作和成员管理继续要求 `admin` |

当前 API 尚未开放团队管理、成员授权或项目成员管理接口；`rbac_teams`、`rbac_team_members` 和 `rbac_project_members` 已作为后续管理接口的数据基础。测试和初始化脚本可通过 `SqlAlchemyPermissionRepository.add_project_member()` 写入项目成员角色。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | 列出项目 |
| `POST` | `/api/v1/projects` | 创建项目 |
| `GET` | `/api/v1/environments` | 列出环境，可用 `project_id` 过滤 |
| `POST` | `/api/v1/environments` | 创建环境 |
| `GET` | `/api/v1/services` | 列出服务，可用 `project_id`、`environment_id` 过滤 |
| `POST` | `/api/v1/services` | 创建服务 |

通用字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 数据库自增 ID |
| `name` | string | 展示名称，1 到 100 字符 |
| `key` | string | 稳定标识，匹配 `^[a-z][a-z0-9_-]*$` |
| `description` | string/null | 描述，最多 500 字符 |
| `status` | string | `active`、`inactive` 或 `archived` |
| `created_at` | string | 服务端创建时间，ISO 8601 格式 |
| `project_id` | number | 环境和服务所属项目 ID |
| `environment_id` | number | 服务所属环境 ID |

当前实现位于 `app/repositories/management.py`，默认使用 `SqlAlchemyManagementRepository`，由 `app/api/dependencies.py` 按请求注入数据库 session。项目权限判断集中在 `app/services/permissions.py` 和 `app/repositories/permissions.py`，管理路由不直接散落角色判断。服务创建先按 `(environment_id, project_id)` 校验环境归属；对无权限跨项目环境统一按环境不存在处理，避免通过 `404/409` 探测其他项目环境 ID；用户对两个相关项目都有权限时仍保留归属不匹配的 `409` 业务错误。数据库 `(environment_id, project_id)` 复合外键继续兜底。`InMemoryManagementRepository` 仅保留给不连接数据库的局部单元测试；当前 API 测试使用 SQLite SQLAlchemy repository 验证契约和约束映射。当前仍未接入分页，后续阶段需要在保持现有响应契约基础上补齐。

## API Key 管理 API

当前阶段提供项目范围 API Key 创建、列表和撤销接口，用于后续摄入 API 鉴权。所有 API Key 管理接口都需要 `Authorization: Bearer <access_token>`，且用户必须拥有目标项目 `admin` 角色；普通用户未处于目标项目权限范围内时与项目不存在一样返回 `404 项目不存在`，避免通过 API Key 管理端点枚举 `project_id`；已在项目内但不是 `admin` 的 `viewer`、`editor` 返回 `403`，超级用户可管理全部项目。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/projects/{project_id}/api-keys` | 列出项目 API Key 元数据 |
| `POST` | `/api/v1/projects/{project_id}/api-keys` | 创建项目 API Key，响应仅这一次包含明文 `api_key` |
| `POST` | `/api/v1/projects/{project_id}/api-keys/{api_key_id}/revoke` | 撤销项目 API Key，撤销后摄入校验入口返回无效 |

创建请求体：

```json
{
  "name": "生产摄入"
}
```

创建响应示例：

```json
{
  "id": 1,
  "project_id": 1,
  "name": "生产摄入",
  "key_prefix": "tlm_xxxxxxxx",
  "status": "active",
  "created_by_user_id": 1,
  "created_at": "2026-06-21T00:00:00Z",
  "revoked_at": null,
  "last_used_at": null,
  "api_key": "tlm_<仅创建响应返回一次>"
}
```

列表和撤销响应不包含 `api_key` 或 `key_hash`。数据库只保存 `key_hash`、`key_prefix` 和元数据；当前哈希为高熵随机 token 的 SHA-256 摘要，明文 key 不写入数据库、README、运行日志或测试日志。`ApiKeyService.verify_key(raw_key)` 已作为后续摄入 API 鉴权入口：有效且未撤销时返回 `api_key_id`、`project_id` 和 `key_prefix`，并更新 `last_used_at`；撤销或不存在时返回 `None`。

错误边界：

| 状态码 | 场景 |
| --- | --- |
| `401` | 缺少或无效 Bearer token |
| `403` | 已认证且处于目标项目权限范围内，但不是目标项目 `admin` |
| `404` | 项目不存在、普通用户不在目标项目权限范围内，或撤销的 API Key 不属于该项目/不存在 |
| `409` | API Key 数据库完整性约束错误 |
| `422` | 请求体字段或路径参数格式错误 |

## Dashboard API

当前阶段提供项目范围 dashboard CRUD 后端基础、全局 `time_range` 最小保存校验、顶层 `variables` 最小保存校验、已保存 panel 的只读查询预览 API、内置 dashboard template 列表/读取/从模板创建普通 dashboard API，以及单个 dashboard JSON 导出/导入 API；panel preview 会在 panel query 未显式设置对应时间边界时继承 dashboard 全局时间范围，并在执行前用请求 query 参数 `variables` 中的一次性变量覆盖值或已保存变量 default 替换顶层 query 字段中的完整 `${变量名}` 模板。内置模板当前至少包含 `service-overview`（服务总览），使用既有 `panels`、`time_range`、`variables` schema，包含 metrics/logs/traces/topology 最小组合。不包含前端页面、真实图表渲染、保存请求时变量覆盖、自动刷新、ClickHouse 查询、模板市场、批量导入、分享/只读模式、文件上传存储、跨项目权限提升、覆盖已有 dashboard 或告警规则。所有接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。普通用户只能访问自己有项目角色的 dashboard；超级用户可访问全部已存在项目。

权限规则：

| 动作 | 最低角色 | 说明 |
| --- | --- | --- |
| 模板列表/读取 | 已认证用户 | 内置模板不依赖项目角色 |
| 列表/读取 | `viewer` | 全局列表自动过滤为可访问项目；指定无成员关系的 `project_id` 返回 `404 项目不存在` |
| 创建/更新/删除 | `editor` | `viewer` 返回 `403 无项目权限`；跨项目 dashboard ID 按 `404 仪表盘不存在` 处理 |
| 从模板创建 | `editor` | 使用路径 `project_id` 作为归属；请求体不能覆盖项目或注入 config |
| 导出 / 导入 | `viewer` / `editor` | 导出不包含实例字段；导入在路径项目下创建普通 dashboard |

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard-templates` | 列出内置 dashboard templates |
| `GET` | `/api/v1/dashboard-templates/{template_id}` | 读取单个内置 dashboard template |
| `GET` | `/api/v1/dashboards` | 列出 dashboard，可用 `project_id`、`limit`、`offset` 过滤/分页 |
| `POST` | `/api/v1/dashboards` | 创建 dashboard |
| `POST` | `/api/v1/projects/{project_id}/dashboard-templates/{template_id}/dashboards` | 从内置模板创建普通 dashboard |
| `POST` | `/api/v1/projects/{project_id}/dashboards/import` | 导入 dashboard JSON 并创建普通 dashboard |
| `GET` | `/api/v1/projects/{project_id}/dashboards/{dashboard_id}` | 读取单个 dashboard |
| `GET` | `/api/v1/projects/{project_id}/dashboards/{dashboard_id}/export` | 导出单个 dashboard 的可移植 JSON 文档 |
| `PATCH` | `/api/v1/projects/{project_id}/dashboards/{dashboard_id}` | 部分更新 dashboard |
| `DELETE` | `/api/v1/projects/{project_id}/dashboards/{dashboard_id}` | 删除 dashboard，成功返回 `204` |

创建请求体：

```json
{
  "project_id": 1,
  "name": "服务总览",
  "description": "值班视图",
  "layout": {"version": 1, "widgets": []},
  "config": {"refresh_seconds": 30}
}
```

响应示例：

```json
{
  "id": 1,
  "project_id": 1,
  "name": "服务总览",
  "description": "值班视图",
  "layout": {"version": 1, "widgets": []},
  "config": {"refresh_seconds": 30},
  "created_by_user_id": 1,
  "updated_by_user_id": 1,
  "created_at": "2026-06-23T10:20:00Z",
  "updated_at": "2026-06-23T10:20:00Z"
}
```

模板列表响应为 `{"items":[...]}`，每个模板包含 `id`、`name`、`description`、`layout`、`config`。读取未知模板返回 `404 仪表盘模板不存在`。从模板创建使用 `POST /api/v1/projects/{project_id}/dashboard-templates/{template_id}/dashboards`，请求体仅允许可选 `name` 和 `description` 覆盖；未传时使用模板默认值。模板创建会先按目标项目执行现有 dashboard 创建权限语义，普通用户无项目成员关系或项目不存在返回 `404 项目不存在`，`viewer` 返回 `403 无项目权限`；未知模板在目标项目权限通过后返回 `404 仪表盘模板不存在`。创建出的记录持久化为普通 dashboard，后续完全复用现有读取、更新、删除、preview、RBAC 和 `layout/config` 校验；请求体中的 `project_id`、`layout`、`config` 等未声明字段返回 `422`，不能覆盖路径项目或注入模板外 config。服务端读取模板时会深拷贝并通过 `DashboardCreate` 校验内置 `layout/config`，避免共享可变 config 引用。

Dashboard JSON 导出使用 `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/export`，权限与读取 dashboard 一致，目标项目至少 `viewer`。响应是可移植文档，只包含 `schema`、`version`、`name`、`description`、`layout`、`config`；当前 `schema` 固定为 `telemetry.dashboard`，`version` 固定为严格整数 `1`，不会包含数据库 `id`、`project_id`、创建/更新用户或创建/更新时间。导入使用 `POST /api/v1/projects/{project_id}/dashboards/import`，请求体为 `{"document": <导出文档>, "name": "可选覆盖", "description": "可选覆盖或 null"}`；未提供覆盖时使用导出文档内的 `name/description`。导入会在目标项目下创建普通 dashboard，权限与创建 dashboard 一致，目标项目至少 `editor`；普通用户无项目成员关系或项目不存在返回 `404 项目不存在`，`viewer` 返回 `403 无项目权限`。导入文档必须包含公开字段 `schema/version/name/description/layout/config`，且不得包含 `id/project_id/created_by_user_id/updated_by_user_id/created_at/updated_at` 等实例字段；非法 schema/version、缺必填字段、未声明字段、非法 `layout/config`、超大/过深/过复杂 JSON、非有限数、非法 panel/time_range/variables 均返回 `422`。导入不支持文件上传存储、批量导入、覆盖已有 dashboard、模板市场、分享/只读或跨项目权限提升。

列表响应为对象 envelope：`{"items": [...], "limit": 50, "offset": 0, "total": 1}`。字段规则：`name` 为 1 到 100 字符，`description` 最多 500 字符；`layout` 和 `config` 必须是 JSON 对象或数组，创建时默认 `{}`，单字段序列化后不超过 64 KiB，嵌套深度不超过 32，复杂度不超过 4096 个节点，且不能包含 `NaN`、`Infinity` 或 `-Infinity`。当 `config` 是对象且包含 `time_range` 时，`time_range` 必须是对象；相对范围保存为 `{"mode":"relative","relative":"15m|1h|6h|24h|7d"}`，`mode/relative` 会裁剪首尾空白并按裁剪后值保存；绝对范围保存为 `{"mode":"absolute","from":"ISO 8601","to":"ISO 8601"}`，`mode/from/to` 会裁剪首尾空白并保留裁剪后的原始字符串，`from/to` 必须可解析并可比较为 ISO 8601 时间且 `from < to`。当 `config` 是对象且包含 `panels` 时，`panels` 必须是数组；每个 panel 必须是对象，包含 `id`（1 到 64 字符）、`title`（1 到 120 字符）、`type`（`metrics`、`logs`、`events`、`traces`、`topology` 之一）和对象类型的 `query`；`id/title/type` 会先裁剪首尾空白再校验和保存，同一 `panels` 内重复 `id` 也按裁剪后值判断；可选 `layout` 必须是对象，包含非负 `x/y` 和正数 `w/h`。当 `config` 是对象且包含 `variables` 时，`variables` 必须是数组；每个变量必须是对象，包含 `name`（1 到 64 字符，仅字母、数字、下划线，且不能以数字开头）和 `type`（`text`、`number`、`select` 之一），可选 `label` 最多 120 字符；`name/label/type/default/options` 字符串值会裁剪首尾空白后保存，同一 `variables` 内重复 `name` 也按裁剪后值判断。`text` 变量可选字符串 `default`，`number` 变量可选有限数字 `default`，二者不接受 `options`；`select` 变量必须提供非空字符串数组 `options`，选项裁剪后不能为空且不能重复，可选 `default` 必须匹配某个 option。旧版 `{"refresh_seconds": 30}`、空 `{}`、没有 `time_range`、没有顶层 `panels` 或没有顶层 `variables` 的 JSON 结构仍保持兼容。更新至少提供一个字段；未传 `layout/config` 时保持原值，传入空对象/空数组有效，`description=null` 表示清空描述，`name/layout/config=null` 返回 `422`。错误边界：缺少或无效 token 返回 `401`；项目不存在、无项目成员关系或 dashboard 不在指定项目下返回 `404`；角色不足返回 `403`；数据库完整性冲突返回 `409`；字段、路径参数、分页参数、非法 `config.time_range`、非法 panel config 或非法 `config.variables` 返回 `422`。

已保存 panel 查询预览：已认证用户可通过 `GET /api/v1/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview` 对单个已保存 panel 生成只读预览。权限要求与读取 dashboard 一致，目标项目至少 `viewer`；项目不存在、普通用户无项目成员关系、dashboard 不属于该项目、不存在或 `panel_id` 未命中已保存 `config.panels[].id` 时返回 `404`。可选 query 参数 `variables` 使用 JSON 对象字符串传递本次 preview 的一次性变量覆盖值，例如 `{"service_source":"api","row_limit":20}`；非法 JSON、非对象、未知变量或覆盖值不符合已保存变量定义时返回 `422`，覆盖值不写回 dashboard。响应包含 `project_id`、`dashboard_id`、`panel_id`、`title`、`panel_type`、原始 `query` 和 `preview`。`metrics` panel 当前使用关系库 `GET /api/v1/query/metrics/aggregate` 同源能力返回 `{"kind":"metrics","mode":"aggregate","items":[...]}`；`logs`、`events`、`traces` 返回最近样本 `items`；`topology` 返回 `nodes` 和 `edges` 摘要。`query` 只读取当前查询 API 已支持的白名单字段：通用 `source`、`occurred_from`、`occurred_to`、`limit`，以及各类型已有的 `name`、`level`、`keyword`、`trace_id`、`span_id`、`request_id`、`user_id`、`status_code`、`duration_min_ms`、`duration_max_ms`、`window`、`aggregation`、`type/event_type` 等；未知字段忽略。执行前会读取已保存 `config.variables`，仅当已保存 panel `query` 顶层字段值完整匹配 `${变量名}` 时替换变量值，再进入现有 query 白名单校验和 preview 执行；请求 `variables` 中同名覆盖值优先于已保存 `default`，否则使用 default。`text/select` 覆盖值和 default 保持字符串且 `select` 必须匹配 options，`number` 覆盖值和 default 保持有限数字且不能是 bool。未知变量、变量无 `default` 且无覆盖、模板语法非法、覆盖值类型不符合变量定义或替换后类型不满足现有 query 校验均返回 `422`；不支持部分字符串拼接替换、数组/对象深层模板替换、表达式、用户会话级变量状态或保存覆盖值。若 dashboard 保存了 `config.time_range`，preview 会在变量覆盖/default 替换后、panel query 未显式设置对应时间边界时转换为 query service 的 `occurred_from` / `occurred_to`；`relative` 支持 `15m/1h/6h/24h/7d` 并基于服务端当前 UTC 时间生成查询范围，`absolute` 使用保存的 `from/to`。panel 显式 `occurred_from` / `occurred_to` 分别优先，因此这些字段通过变量覆盖解析出的值也优先于 dashboard 全局范围。`limit` 范围为 `1..100`，非法 query 字段类型、非法时间、非法聚合窗口或 duration 下界大于上界等沿现有 query service 语义返回 `422`。该接口只读取已保存 dashboard，不支持未保存草稿 config，不写入 dashboard，不接 ClickHouse，不执行图表渲染、自动刷新或告警逻辑。

## Alert Rules API

当前阶段提供告警规则 CRUD 后端基础、指标阈值告警手动评估 API 和超级用户触发的到期规则扫描 API。周期扫描会把每条 due 规则的当前状态持久化到 `alert_evaluation_states`；除 `next_evaluate_at` 驱动的到期写入外，旧状态非 `disabled` 的禁用规则会触发一次强制 disabled 收敛写入。当前不启动后台常驻 scheduler，不做通知、告警历史、静默/恢复、Webhook、前端 UI 或 ClickHouse/MongoDB/Redis 后台链路。所有接口均需要 `Authorization: Bearer <access_token>`，且 token 对应用户必须启用。普通用户只能访问自己有项目角色的告警规则；超级用户可访问全部已存在项目。

权限规则：

| 动作 | 最低角色 | 说明 |
| --- | --- | --- |
| 列表/读取 | `viewer` | 全局列表自动过滤为可访问项目；指定无成员关系的 `project_id` 返回 `404 项目不存在` |
| 手动评估 | `viewer` | 只评估 `signal=metrics` 的指标阈值规则；跨项目 rule ID 按 `404 告警规则不存在` 处理 |
| 到期扫描 | 超级用户 | `POST /api/v1/alerts/evaluations/run-due` 只允许超级用户触发；普通用户返回 `403` |
| 创建/更新/删除 | `editor` | `viewer` 返回 `403 无项目权限`；跨项目 rule ID 按 `404 告警规则不存在` 处理 |

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/alerts/rules` | 列出告警规则，可用 `project_id`、`severity`、`signal`、`enabled`、`limit`、`offset` 过滤/分页 |
| `POST` | `/api/v1/alerts/rules` | 创建告警规则 |
| `POST` | `/api/v1/alerts/evaluations/run-due` | 超级用户触发一次 due 规则扫描并持久化当前状态 |
| `GET` | `/api/v1/projects/{project_id}/alerts/rules/{rule_id}` | 读取单个告警规则 |
| `POST` | `/api/v1/projects/{project_id}/alerts/rules/{rule_id}/evaluate` | 手动评估指标阈值告警规则 |
| `PATCH` | `/api/v1/projects/{project_id}/alerts/rules/{rule_id}` | 部分更新告警规则 |
| `DELETE` | `/api/v1/projects/{project_id}/alerts/rules/{rule_id}` | 删除告警规则，成功返回 `204` |

创建请求体：

```json
{
  "project_id": 1,
  "name": "HTTP 5xx rate",
  "description": "5 分钟错误率过高",
  "enabled": true,
  "severity": "critical",
  "signal": "metrics",
  "condition": {"metric": "http.server.errors", "operator": "gt", "threshold": 3},
  "evaluation": {"window_seconds": 300, "interval_seconds": 60}
}
```

响应示例：

```json
{
  "id": 1,
  "project_id": 1,
  "name": "HTTP 5xx rate",
  "description": "5 分钟错误率过高",
  "enabled": true,
  "severity": "critical",
  "signal": "metrics",
  "condition": {"metric": "http.server.errors", "operator": "gt", "threshold": 3},
  "evaluation": {"window_seconds": 300, "interval_seconds": 60},
  "created_by_user_id": 1,
  "updated_by_user_id": 1,
  "created_at": "2026-06-26T12:00:00Z",
  "updated_at": "2026-06-26T12:00:00Z"
}
```

字段规则：`project_id` 必填且为正整数；`name` 必填，1 到 100 字符，首尾空白会裁剪，同一项目内唯一；`description` 可选，最多 500 字符；`enabled` 默认 `true`；`severity` 取 `info`、`warning`、`critical`；`signal` 取 `metrics`、`logs`、`traces`、`events`。`condition` 和 `evaluation` 必须是非空 JSON 对象，单字段序列化后不超过 16 KiB，嵌套深度不超过 16，复杂度不超过 1024 个节点，且不能包含 `NaN`、`Infinity` 或 `-Infinity`。`evaluation` 当前还要求 `window_seconds` 和 `interval_seconds` 为 `1..86400` 的整数。

列表响应为对象 envelope：`{"items": [...], "limit": 50, "offset": 0, "total": 1}`。更新至少提供一个字段；未传 `condition/evaluation` 时保持原值，`description=null` 表示清空描述，其他可更新字段传 `null` 返回 `422`。错误边界：缺少或无效 token 返回 `401`；项目不存在、无项目成员关系或规则不在指定项目下返回 `404`；角色不足返回 `403`；同项目规则名称重复或其他数据库完整性冲突返回 `409`；字段、路径参数、分页参数、枚举、JSON 形状或 evaluation 窗口非法返回 `422`。

手动评估接口 `POST /api/v1/projects/{project_id}/alerts/rules/{rule_id}/evaluate` 无请求体，读取已保存规则。当前仅支持 `signal="metrics"`，非 metrics 返回 `422`。`condition.metric` 对应关系库 `ingest_records.event_type` 中保存的指标名，必填且长度 `1..128`；`condition.source` 可选，长度 `1..128`，按 `ingest_records.source` 精确过滤；`operator` 支持 `gt/gte/lt/lte/eq/ne`；`threshold` 必须是有限 JSON number，拒绝 bool 和字符串数字；`aggregation` 默认 `avg`，支持 `avg/sum/min/max/count`。服务端以当前 UTC 时间作为 `checked_at`，按 `[checked_at - evaluation.window_seconds, checked_at]` 查询 `kind=metric` 样本，`evaluation.interval_seconds` 仅原样返回，不做调度。响应状态为 `firing`、`ok`、`no_data` 或 `disabled`；禁用规则返回 `disabled` 且不查询指标样本，无样本返回 `no_data`，有样本时返回规范化 condition、窗口、observed 聚合值/sample_count/unit 和 message。

到期扫描接口 `POST /api/v1/alerts/evaluations/run-due` 无请求体，当前也不实现 `limit` 或 `project_id` 可选参数。服务端扫描 enabled 告警规则，以及已存在当前状态的 disabled 规则；disabled 且没有当前状态的规则不会创建新状态。schedule due 判断优先使用状态表 `next_evaluate_at`：缺少状态或 `next_evaluate_at <= checked_at` 时视为 due；若缺少 `next_evaluate_at` 但有 `last_evaluated_at`，则按 `last_evaluated_at + evaluation.interval_seconds` 计算下一次时间，只有两者都缺失才视为 due。旧状态非 `disabled` 的禁用规则是 `next_evaluate_at` 之外的强制 due/write 例外：只要 disabled 且已有当前状态、旧状态为 `firing/ok/no_data/error`，本轮就会立即写入 `status=disabled`、清空 `last_error`、计入 `evaluated_count` 和 `updated_state_count`，并在对应 `items[]` 中返回 `due=true`；disabled 且没有当前状态仍不创建新状态；已是 `disabled` 且未到期则只计入 skipped，响应 `due=false`。due 规则复用手动评估的 metrics 阈值语义执行，成功后写入 `status=firing/ok/no_data`、`last_evaluated_at`、`next_evaluate_at=checked_at+evaluation.interval_seconds`、`last_result` 和清空 `last_error`；当前非 metrics 或不满足 API-0026 执行语义的 enabled 规则写入 `status=error` 和 `last_error`，推进下一次评估时间，并保留之前最近一次成功评估的 `last_result`。其他未到期规则只计入 skipped，不更新状态；首次并发创建当前状态时，repository 会在唯一约束冲突后 rollback、重新读取并复查 due 状态，避免把重复扫描暴露为 `500`。响应为本轮扫描摘要：`checked_at`、`evaluated_count`、`skipped_count`、`created_state_count`、`updated_state_count`、`items[]`，每项包含 `rule_id`、`project_id`、`old_status`、`new_status`、`due`、`next_evaluate_at` 和 `error_summary`。

## 数据摄入 API

当前阶段提供 events、metrics、logs 和 traces 摄入入口，用于闭环“API Key 可用于数据上报”。摄入接口不接受登录态 JWT，也不接受客户端传入 `project_id`；后端只从 API Key 校验结果推导 `project_id` 和 `api_key_id`，并写入 `ingest_records`。支持两种鉴权头：

- `Authorization: Bearer <api_key>`
- `X-API-Key: <api_key>`

两者同时存在时优先使用 `Authorization`。无效、缺失或已撤销 API Key 均返回 `401`；代码不输出 API Key 明文或 payload 请求体日志。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/ingest/events` | 摄入单条事件，成功返回 accepted receipt |
| `POST` | `/api/v1/ingest/batch` | 批量摄入事件，当前仅支持 `events` 数组 |
| `POST` | `/api/v1/ingest/metrics` | 批量摄入指标 datapoints，当前使用 `metrics` 数组 |
| `POST` | `/api/v1/ingest/logs` | 批量摄入日志记录，当前使用 `logs` 数组 |
| `POST` | `/api/v1/ingest/traces` | 批量摄入 trace spans，当前使用 `spans` 数组 |

单条事件请求体：

```json
{
  "type": "deployment",
  "source": "ci",
  "timestamp": "2026-06-21T00:00:00Z",
  "payload": {
    "version": "1.2.3",
    "status": "ok"
  }
}
```

字段规则：

| 字段 | 规则 |
| --- | --- |
| `type` | 必填，1 到 128 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `source` | 可选，最长 128 字符 |
| `timestamp` | 可选，ISO 8601 时间；入库为 `occurred_at` |
| `payload` | 必填对象，单事件 JSON 序列化后不超过 64 KiB |

批量请求体：

```json
{
  "events": [
    {"type": "deploy.started", "payload": {"id": "d-1"}},
    {"type": "deploy.finished", "payload": {"id": "d-1", "ok": true}}
  ]
}
```

批量规则：`events` 至少 1 条、最多 100 条；批量 JSON 序列化后不超过 256 KiB。

指标请求体：

```json
{
  "metrics": [
    {
      "name": "http.server.duration",
      "value": 12.5,
      "timestamp": "2026-06-21T00:00:00Z",
      "unit": "ms",
      "type": "histogram",
      "source": "api",
      "tags": {
        "route": "/health"
      },
      "payload": {
        "bucket": "p95"
      }
    }
  ]
}
```

指标规则：`metrics` 至少 1 条、最多 100 条；整体 JSON 序列化后不超过 256 KiB。单条字段规则：

| 字段 | 规则 |
| --- | --- |
| `name` | 必填，1 到 128 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `value` | 必填，有限数值；`NaN`、`Infinity`、`-Infinity` 返回 `422` |
| `timestamp` | 可选，ISO 8601 时间；入库为 `occurred_at` |
| `unit` | 可选，最长 32 字符 |
| `type` | 可选，最长 64 字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `source` | 可选，最长 128 字符 |
| `tags` | 可选对象，任意层级不得包含非有限数值 |
| `payload` | 可选对象，任意层级不得包含非有限数值 |

日志请求体：

```json
{
  "logs": [
    {
      "level": "info",
      "message": "deployment finished",
      "timestamp": "2026-06-21T00:00:00Z",
      "logger": "deploy.worker",
      "source": "worker",
      "trace_id": "trace-1",
      "span_id": "span-1",
      "attributes": {
        "service": "api"
      },
      "payload": {
        "duration_ms": 42
      }
    }
  ]
}
```

日志规则：`logs` 至少 1 条、最多 100 条；整体 JSON 序列化后不超过 256 KiB。单条字段规则：

| 字段 | 规则 |
| --- | --- |
| `level` | 必填，1 到 32 字符，匹配 `^[A-Za-z][A-Za-z0-9._:-]*$` |
| `message` | 必填，1 到 8192 字符 |
| `timestamp` | 可选，ISO 8601 时间；入库为 `occurred_at` |
| `logger` | 可选，最长 128 字符 |
| `source` | 可选，最长 128 字符 |
| `trace_id` | 可选，最长 128 字符 |
| `span_id` | 可选，最长 128 字符 |
| `attributes` | 可选对象，任意层级不得包含非有限数值 |
| `payload` | 可选对象，任意层级不得包含非有限数值 |

Trace 请求体：

```json
{
  "spans": [
    {
      "trace_id": "trace-1",
      "span_id": "span-1",
      "parent_span_id": "root-span",
      "name": "GET /health",
      "start_time": "2026-06-21T00:00:00Z",
      "end_time": "2026-06-21T00:00:00.125Z",
      "duration_ms": 125,
      "status_code": "ok",
      "source": "api",
      "attributes": {
        "service.name": "backend"
      },
      "payload": {
        "http.method": "GET"
      }
    }
  ]
}
```

Trace 规则：`spans` 至少 1 条、最多 100 条；整体 JSON 序列化后不超过 256 KiB。单条字段规则：

| 字段 | 规则 |
| --- | --- |
| `trace_id` | 必填，1 到 128 字符 |
| `span_id` | 必填，1 到 128 字符 |
| `parent_span_id` | 可选，最长 128 字符 |
| `name` | 必填，1 到 128 字符 |
| `start_time` | 必填，ISO 8601 时间；入库为 `occurred_at` |
| `end_time` | 可选，ISO 8601 时间；不能早于 `start_time`，且与 `start_time` 时区格式一致 |
| `duration_ms` | 可选，有限非负数值；未传且有 `end_time` 时后端按起止时间计算 |
| `status_code` | 可选，最长 64 字符 |
| `source` | 可选，最长 128 字符 |
| `attributes` | 可选对象，任意层级不得包含非有限数值 |
| `payload` | 可选对象，任意层级不得包含非有限数值 |

单条成功响应：`202 Accepted`

```json
{
  "id": 1,
  "project_id": 1,
  "kind": "event",
  "type": "deployment",
  "received_at": "2026-06-21T00:00:00Z"
}
```

批量成功响应：`202 Accepted`

```json
{
  "accepted_count": 2,
  "receipts": [
    {
      "id": 1,
      "project_id": 1,
      "kind": "event",
      "type": "deploy.started",
      "received_at": "2026-06-21T00:00:00Z"
    }
  ]
}
```

错误边界：

| 状态码 | 场景 |
| --- | --- |
| `401` | 缺少 API Key、API Key 无效或已撤销 |
| `422` | 请求体字段格式错误、出现额外字段、缺失必填字段、payload/tags/attributes 超限或含非有限数值、metrics value 非有限数值、logs message 超长、trace duration/time 无效或批量条数/大小超限 |

持久化映射：events 写入 `kind=event` 且 `event_type=type`；metrics 写入 `kind=metric` 且 `event_type=name`；logs 写入 `kind=log` 且 `event_type=level`；traces 写入 `kind=trace` 且 `event_type=name`。四类记录都复用 `ingest_records` 的 `source`、`payload`、`occurred_at` 和 `received_at` 字段；trace payload 会保存 `trace_id`、`span_id`、`parent_span_id`、`name`、`start_time`、`end_time`、`duration_ms`、`status_code`、`source`、`attributes`、业务 `payload` 和原始 span `raw`。`ingest_records.kind` 是字符串列，新增 `trace` kind 不需要新迁移；后续可按存储策略再拆分到专用时序/日志/trace 后端。

安全边界：摄入接口当前只做最小持久化；不会把客户端 payload、tags 或 attributes 中的 `project_id` 作为项目归属，若 `project_id` 出现在顶层请求体会因额外字段返回 `422`，若出现在嵌套业务载荷内仅保存为业务字段，不影响归属；嵌套业务载荷任意层级的 `NaN`、`Infinity` 或 `-Infinity` 均返回 `422`。当前尚未实现审计日志或 ClickHouse/MongoDB 写入。

摄入限流：`INGEST_RATE_LIMIT_ENABLED=true` 时，后端按已验证 API Key ID 做固定窗口限流。默认 `INGEST_RATE_LIMIT_BACKEND=memory` 使用单进程内存计数器，适合本地开发、测试和单实例保护；`INGEST_RATE_LIMIT_BACKEND=redis` 时使用 `REDIS_URL` 的 Redis 固定窗口计数器，适合多实例共享限流状态。超限响应为 `429 Too Many Requests`，响应体 `detail=摄入请求过于频繁`，并返回 `Retry-After` 秒数；Redis 不可用时返回 `503 Service Unavailable`，响应体 `detail=摄入限流服务不可用`。

摄入统计：成功摄入后会按分钟桶、项目、API Key、kind 和 source 聚合写入关系库 `ingest_stats`。已认证用户可通过 `GET /api/v1/ingest/stats` 查询自己有项目角色的统计，支持 `project_id`、`kind` 和 `limit` 参数；无权项目按“不存在”处理。当前统计 accepted 计数、payload 字节数，以及已验证 API Key 后的请求体验证失败和限流拒绝；缺失/无效/撤销 API Key 等缺少可信归属的失败请求暂不统计，ClickHouse `ingest_stats` 写入和更完整聚合查询后续补齐。

事件查询：已认证用户可通过 `GET /api/v1/query/events` 查询自己有项目角色的事件记录，支持 `project_id`、`type`、`source`、`occurred_from`、`occurred_to`、`limit` 和可选 `cursor` 参数；显式查询不存在或无权项目返回 `404 项目不存在`，超级用户也不会绕过项目存在性校验。响应统一为 `{"items": [...], "next_cursor": string | null}`，`next_cursor=null` 表示没有更多数据；游标绑定事件查询和当前筛选条件，并基于 `received_at` 与 `id` 倒序排序生成，避免同一接收时间记录翻页重复或漏项。非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`。当前查询来源为关系库 `ingest_records` 的 `kind=event` 记录；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；不接 ClickHouse/MongoDB，全文搜索和复杂聚合后续补齐。

日志查询：已认证用户可通过 `GET /api/v1/query/logs` 查询自己有项目角色的日志记录，支持 `project_id`、`level`、`source`、`keyword`、`trace_id`、`span_id`、`request_id`、`user_id`、`occurred_from`、`occurred_to`、`limit` 和可选 `cursor` 参数；`keyword` 长度 `1..128`，后端会去除前后空白，空白字符串按未传处理，当前匹配日志 `message` 和日志业务 `payload` 的值文本，不匹配业务 `payload` key 名、wrapper key 名、`logger`/`trace_id`/`span_id`/`attributes` 等元字段或空值脚手架；SQLite 兼容层覆盖业务 `payload` 嵌套对象/数组中的字符串、数字和布尔值，MySQL 兼容层通过 `JSON_SEARCH` 覆盖业务 `payload` 字符串值。`trace_id`、`span_id`、`request_id` 和 `user_id` 长度均为 `1..128`，后端会去除前后空白，空白字符串按未传处理；`trace_id` / `span_id` 只按日志顶层结构化字段 `ingest_records.payload.trace_id` / `payload.span_id` 的字符串值做精确匹配，`request_id` / `user_id` 只按日志结构化 `attributes` 白名单字段 `ingest_records.payload.attributes.request_id` / `payload.attributes.user_id` 做精确匹配，并且仅 JSON string/text 值参与匹配；numeric/boolean/object/array 同名 `attributes` 值不会命中，不作为 keyword 文本搜索，不搜索业务 `payload` 内同名字段，也不开放任意 JSON 字段查询。显式查询不存在或无权项目返回 `404 项目不存在`，超级用户也不会绕过项目存在性校验。响应统一为 `{"items": [...], "next_cursor": string | null}`，`next_cursor=null` 表示没有更多数据；游标绑定日志查询和当前筛选条件（含规范化后的 `keyword`、`trace_id`、`span_id`、`request_id` 和 `user_id`），并基于 `received_at` 与 `id` 倒序排序生成。非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`。当前查询来源为关系库 `ingest_records` 的 `kind=log` 记录，并从 JSON 载荷中展开 `message`、`logger`、`trace_id`、`span_id`、`attributes` 和业务 `payload`；基础关键词搜索和白名单结构化字段过滤不引入 ClickHouse、全文索引或外部服务；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；ClickHouse 日志查询、任意字段 DSL 和脱敏后续补齐。

日志上下文：已认证用户可通过 `GET /api/v1/query/logs/{log_id}/context` 查看某条日志在同项目内的前后文，查询参数 `before` 和 `after` 默认均为 `5`，范围 `0..20`。目标日志不存在、不是日志记录，或当前用户没有目标日志所属项目角色时，统一返回 `404 日志不存在`。响应为 `{"target": LogQueryResponse, "before": LogQueryResponse[], "after": LogQueryResponse[]}`；上下文限定目标日志同一 `project_id` 且 `kind=log`，不要求同 `source` 或 `level`。排序锚点与分页一致，基于 `received_at` 和 `id`；`before` 为早于目标日志的记录，`after` 为晚于目标日志的记录，两组都按时间正序返回，便于前端按 `before + target + after` 展示。当前上下文来源仍是关系库 `ingest_records`，并由 `(project_id, kind, received_at, id)` 组合索引支撑前后窗口过滤与排序；不接 ClickHouse 日志存储或全文搜索。

Trace 查询：已认证用户可通过 `GET /api/v1/query/traces` 查询自己有项目角色的 trace span 记录，支持 `project_id`、`trace_id`、`span_id`、`name`、`source`、`status_code`、`duration_min_ms`、`duration_max_ms`、`occurred_from`、`occurred_to`、`limit` 和可选 `cursor` 参数；`trace_id`、`span_id` 长度均为 `1..128`，`status_code` 长度为 `1..64`，后端会去除前后空白，空白字符串按未传处理；`duration_min_ms` / `duration_max_ms` 为非负有限数值，且下界不能大于上界。显式查询不存在或无权项目返回 `404 项目不存在`，超级用户也不会绕过项目存在性校验。响应统一为 `{"items": [...], "next_cursor": string | null}`，单条 span 展开 `trace_id`、`span_id`、`parent_span_id`、`name`、`start_time`、`end_time`、`duration_ms`、`status_code`、`source`、`attributes`、业务 `payload`、`occurred_at` 和 `received_at`；`raw` 原始 span 当前只保存在摄入 payload 中，不默认返回。`status_code` 按 trace payload 顶层 `status_code` 精确匹配，duration 上下界按 trace payload 顶层 `duration_ms` 数值过滤；时间范围筛选按 span `start_time` 入库后的 `occurred_at` 执行；MySQL/MariaDB 通过 `DATETIME(6)` 保留微秒，`occurred_from`/`occurred_to` 对毫秒边界做精确比较。列表排序和 cursor 仍沿用现有查询 API 的 `received_at` 与 `id` 倒序稳定排序，避免同一接收时间记录翻页重复或漏项。非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`；trace cursor 签名包含规范化后的 `trace_id`、`span_id`、`status_code` 以及 `duration_min_ms` / `duration_max_ms`。当前查询来源为关系库 `ingest_records` 的 `kind=trace` 记录，带 `project_id` 或项目权限过滤的分页复用 `(project_id, kind, received_at, id)` 组合索引；不接 ClickHouse，不做跨信号关联或日志互跳。

Trace 服务拓扑：已认证用户可通过 `GET /api/v1/query/traces/topology` 查询单项目服务拓扑摘要，`project_id` 必填，支持可选 `occurred_from`、`occurred_to`、`source` 和 `limit` 参数；显式查询不存在或无权项目返回 `404 项目不存在`。查询来源仍为关系库 `ingest_records.kind=trace`，后端把 trace span 的 `source` 作为服务节点，并在同一 `trace_id` 内根据 child span 的 `parent_span_id` 指向 parent span 的 `span_id` 推导跨 source 调用边；parent/child 任一缺少 source、source 相同、parent 缺失，或同一 `trace_id` 内存在重复 `span_id` 导致 parent 归属不唯一时不生成边。响应为 `{"nodes": [...], "edges": [...]}`；节点字段为 `source`、`span_count`、`trace_count`、`error_span_count`、`avg_duration_ms`、`max_duration_ms`，边字段为 `from_source`、`to_source`、`call_count`、`error_count`、`avg_duration_ms`、`max_duration_ms`。错误计数当前按 trace payload 顶层 `status_code` 规范化后等于 `error` 统计；duration 聚合使用 trace payload 顶层 `duration_ms`，缺失 duration 不参与平均和最大值。`source` 筛选返回该 source 及其相邻 source 组成的子图；`limit` 默认 `100`，范围 `1..500`，限制返回节点数，并且只返回两端节点都在返回节点集合中的边。拓扑扫描还受 `QUERY_TRACE_TOPOLOGY_SPAN_SCAN_LIMIT` 保护，默认最多在数据库侧读取 `10000` 条匹配 span；该 scan limit 用于控制读取窗口，与接口 `limit` 的返回节点裁剪语义不同。当前不接 ClickHouse、不做前端拓扑图、不做复杂布局、不做跨项目聚合或任意标签拓扑。

指标查询：已认证用户可通过 `GET /api/v1/query/metrics` 查询自己有项目角色的指标样本，支持 `project_id`、`name`、`source`、`occurred_from`、`occurred_to`、`limit` 和可选 `cursor` 参数；显式查询不存在或无权项目返回 `404 项目不存在`，超级用户也不会绕过项目存在性校验。响应统一为 `{"items": [...], "next_cursor": string | null}`，`next_cursor=null` 表示没有更多数据；游标绑定指标查询和当前筛选条件，并基于 `received_at` 与 `id` 倒序排序生成。非法、损坏、不匹配当前查询类型或不匹配当前筛选条件的游标返回 `422 cursor 无效或不匹配当前查询`。当前查询来源为关系库 `ingest_records` 的 `kind=metric` 记录，并从 JSON 载荷中展开 `value`、`unit`、`type`、`tags` 和业务 `payload`；带 `project_id` 或项目权限过滤的分页可复用 `(project_id, kind, received_at, id)` 组合索引；ClickHouse 指标查询、group by、Top N、降采样和多序列对比后续补齐。

指标聚合窗口：已认证用户可通过 `GET /api/v1/query/metrics/aggregate` 查询自己有项目角色的指标窗口聚合，支持 `project_id`、`name`、`source`、`occurred_from`、`occurred_to`、`window`、`aggregation` 和 `limit` 参数；显式查询不存在或无权项目返回 `404 项目不存在`，超级用户也不会绕过项目存在性校验。`window` 默认 `5m`，当前支持 `1m`、`5m`、`15m`、`1h`；`aggregation` 默认 `avg`，当前支持 `avg`、`sum`、`min`、`max`、`count`；`limit` 默认 `100`，范围 `1..500`。响应为 `{"items": [...]}`，不返回 cursor，不改变指标样本列表 envelope。当前按 `project_id`、指标名、`source` 和窗口开始时间分组，基于关系库 `ingest_records.kind=metric` 与 JSON payload `value` 聚合；窗口按 Unix epoch 固定分桶，MySQL/MariaDB 使用 UTC epoch 秒差表达式并显式下取整到窗口起点，避免受 session time zone 影响或将 `00:00:59`、`00:04:59` 等边界样本上浮到下一桶；`unit` 取窗口内最小非空 unit。暂不接 ClickHouse，不支持 tags group by、percentile、Top N、单位换算或多序列对比。

## 目录结构

```text
app/
  api/              # API 路由和接口入口
  core/             # 配置读取、应用工厂等核心能力
  db/               # 数据库连接和迁移入口
  ingest/           # 遥测数据摄入模块
  query/            # 遥测数据查询模块
  alerts/           # 告警模块
  workers/          # 后台 worker
  models/           # 持久化模型
  schemas/          # Pydantic DTO
  services/         # 业务服务层
  repositories/     # 数据访问层，管理 API 默认使用 SQLAlchemy repository；内存实现仅用于局部测试
  providers/        # 基础设施 provider
  adapters/         # 第三方系统 adapter
  tasks/            # 后台任务
  telemetry/        # 后端自身观测性
migrations/         # Alembic 数据库迁移
docker/
  clickhouse/init/  # ClickHouse 开发容器初始化 SQL
tests/              # pytest 测试
```

关键入口：

- `main.py`：本地启动入口，按配置启动 uvicorn。
- `app/core/config.py`：集中读取环境变量和 `VERSION`。
- `app/core/application.py`：FastAPI app factory。
- `app/db/base.py`：SQLAlchemy declarative base。
- `app/db/session.py`：SQLAlchemy engine 和 session factory。
- `app/api/router.py`：聚合 API 路由。
- `app/api/dependencies.py`：请求级数据库 session、管理服务、认证服务和当前用户依赖。
- `app/api/routes/auth.py`：登录和当前用户接口。
- `app/api/routes/api_keys.py`：项目 API Key 创建、列表和撤销接口。
- `app/api/routes/alerts.py`：项目告警规则创建、列表、读取、更新、删除、手动评估和到期扫描接口。
- `app/api/routes/dashboard.py`：项目 dashboard 创建、列表、读取、更新、删除、panel preview 和内置模板接口。
- `app/api/routes/health.py`：健康检查接口。
- `app/api/routes/ingest.py`：API Key 鉴权的数据摄入接口。
- `app/api/routes/management.py`：项目、环境、服务管理接口。
- `app/models/api_keys.py`：API Key ORM 模型。
- `app/models/alerts.py`：Alert Rule 和 Alert Evaluation State ORM 模型。
- `app/models/auth.py`：用户 ORM 模型。
- `app/models/dashboard.py`：Dashboard ORM 模型。
- `app/models/ingest.py`：最小摄入记录 ORM 模型。
- `app/models/management.py`：项目、环境、服务 ORM 模型。
- `app/schemas/auth.py`：认证 API 的 Pydantic 请求和响应模型。
- `app/schemas/api_keys.py`：API Key API 的 Pydantic 请求和响应模型。
- `app/schemas/alerts.py`：Alert Rules API 的 Pydantic 请求、更新、评估和扫描响应模型。
- `app/schemas/dashboard.py`：Dashboard API 的 Pydantic 请求、更新、模板和响应模型。
- `app/schemas/ingest.py`：摄入 API 的 Pydantic 请求和响应模型。
- `app/schemas/management.py`：基础管理 API 的 Pydantic 请求和响应模型。
- `app/schemas/permissions.py`：项目角色枚举和角色层级判断。
- `app/services/auth.py`：密码哈希、token 签发/解析和认证规则。
- `app/services/api_keys.py`：API Key 生成、哈希、权限校验、撤销和后续摄入校验入口。
- `app/services/alerts.py`：Alert Rules CRUD、项目权限、资源隐藏、手动评估和到期扫描规则。
- `app/services/dashboard.py`：Dashboard CRUD、模板创建用例、项目权限和资源隐藏规则。
- `app/services/dashboard_templates.py`：内置 dashboard template 定义、读取、深拷贝和保存层校验入口。
- `app/services/ingest.py`：摄入用例服务，按 API Key 上下文写入项目范围记录。
- `app/services/management.py`：基础管理业务规则和归属关系校验。
- `app/services/permissions.py`：项目级权限判断入口，包含超级用户绕过和角色校验。
- `app/repositories/auth.py`：认证 repository 协议和 SQLAlchemy 实现。
- `app/repositories/api_keys.py`：API Key repository 协议和 SQLAlchemy 实现。
- `app/repositories/alerts.py`：Alert Rules 和 Alert Evaluation States repository 协议及 SQLAlchemy 实现。
- `app/repositories/dashboard.py`：Dashboard repository 协议和 SQLAlchemy 实现。
- `app/repositories/ingest.py`：摄入记录 repository 协议和 SQLAlchemy 实现。
- `app/repositories/management.py`：基础管理 repository 协议、SQLAlchemy 实现和测试用内存实现。
- `app/repositories/permissions.py`：项目成员角色 repository 协议和 SQLAlchemy 实现。
- `migrations/versions/20260620_0001_create_management_tables.py`：项目、环境、服务表迁移。
- `migrations/versions/20260620_0002_create_auth_users.py`：用户表迁移。
- `migrations/versions/20260620_0003_create_rbac_tables.py`：团队、团队成员、项目成员角色表迁移。
- `migrations/versions/20260621_0004_create_api_keys.py`：API Key 表迁移。
- `migrations/versions/20260621_0005_create_ingest_records.py`：最小摄入记录表迁移。
- `migrations/versions/20260622_0007_add_ingest_records_query_index.py`：为日志上下文和带项目过滤的查询分页补充 `ingest_records(project_id, kind, received_at, id)` 组合索引。
- `migrations/versions/20260622_0008_ingest_records_mysql_microseconds.py`：将 MySQL/MariaDB `ingest_records.occurred_at` 与 `received_at` 升级为 `DATETIME(6)`，保证毫秒/微秒级时间范围过滤。
- `migrations/versions/20260623_0009_create_dashboards.py`：创建项目 dashboard 元数据表、JSON 配置列和项目列表索引。
- `migrations/versions/20260626_0010_create_alert_rules.py`：创建项目告警规则表、JSON 条件/评估列、项目内名称唯一约束和项目列表索引。
- `migrations/versions/20260627_0011_create_alert_evaluation_states.py`：创建告警当前评估状态表、JSON 最新结果列、规则唯一状态约束和到期扫描索引。

## 验证命令

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy .
docker compose --env-file .env.example -f docker-compose.dev.yml config --quiet
uv run pytest tests/test_clickhouse_init.py tests/test_mongodb_init.py
uv run alembic upgrade head
uv run python main.py
```

当前阶段尚未引入用户创建管理界面、团队/成员管理 API、项目成员授权 API、前端 dashboard 页面、panel 图表渲染、告警评估/调度/通知逻辑，真实 MySQL/ClickHouse/MongoDB/Redis 服务也尚未在本 worktree 启动。因此后端验证边界限定为配置读取、应用创建、健康检查契约、基础管理 API 契约、认证 API 契约、密码哈希、项目级 RBAC 判断、API Key 明文只返回一次且不入库、撤销后 `verify_key()` 失效、API Key 管理端点对无项目权限普通用户隐藏项目存在性、dashboard CRUD 成功路径、项目权限隔离、viewer/editor/superuser 角色边界、无权限/跨项目 dashboard 隐藏、dashboard `layout/config` 对象或数组校验、大小/深度/复杂度限制、非有限数拒绝、`config.time_range` 相对/绝对范围保存、首尾空白规范化、legacy config 兼容和非法 time range `422`、`config.variables` 合法保存、字符串规范化、legacy 缺省兼容、重复 name、非法 name/type/options/default `422`、partial update 未传 JSON 字段保持原值、空对象/空数组更新语义、limit/offset 分页、内置 dashboard template 列表/读取、未知模板 `404`、从服务总览模板创建普通 dashboard、模板创建权限隐藏、请求体无法覆盖路径项目或注入 config、模板 config 保存层校验和深拷贝、已保存 dashboard panel 查询预览的 metrics/logs/events/traces/topology 响应、preview 继承 dashboard 全局 `config.time_range`、panel 显式时间单边覆盖优先、panel query 顶层完整 `${变量名}` 替换 text/select/number default、原始 query 响应保持不变、未知变量/缺 default/非法模板/替换后类型非法 `422`、数组/对象深层模板不替换、viewer 可预览、无权限用户隐藏、legacy config/panel 不存在隐藏和非法 panel query `422`、告警规则 CRUD 成功路径、viewer/editor/superuser 角色边界、无权限/跨项目规则隐藏、viewer 写入 `403`、同项目名称重复 `409`、severity/signal/condition/evaluation/空 patch/limit/offset 校验 `422`、SQLite dashboard 和 alert_rules 迁移升降级、MySQL dashboard/alert_rules JSON DDL 编译、摄入 API 使用 API Key 绑定项目、缺失/无效/撤销 API Key 拒绝、payload 校验错误清晰、客户端无法通过顶层 `project_id` 覆盖归属、创建项目与创建者授权事务回滚、跨项目 environment_id 非泄露、启用后摄入 API Key 固定窗口限流返回 `429`、Redis 限流后端固定窗口计数与不可用错误映射、成功摄入后关系库统计聚合和项目权限查询、已验证 API Key 后的验证失败/限流拒绝统计、trace spans 摄入绑定 API Key 项目、`kind=trace` 写入、trace payload/raw span 持久化、trace duration/time 校验、trace 非有限值拒绝、trace 验证失败/限流拒绝按 `kind=trace` 统计、事件/日志/指标/trace 查询 API 权限过滤、基础筛选和基于 `received_at` + `id` 的游标分页、trace 查询从 payload 顶层关键字段展开 span、按 `trace_id`/`span_id`/`name`/`source`/`status_code`/`duration_ms` 上下界/时间范围过滤、trace cursor 筛选签名不匹配返回 `422`、trace 服务拓扑节点/边推导、权限、时间/source 过滤、空结果、错误计数和 duration 聚合、数据库侧 scan limit、重复 `span_id` parent 归属不唯一时跳过 child edge、SQLite/MySQL/MariaDB trace 顶层 JSON 字段和 duration 数值比较 SQL 编译、日志关键词命中 message/业务 payload 值文本、业务 payload key-only 不命中、不命中 wrapper key 与 null 脚手架、SQLite 递归命中业务 payload 嵌套对象/数组值、LIKE 通配符按字面匹配、与 level/source/time/project 权限叠加、keyword 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志 `trace_id`/`span_id` 顶层结构化字段精确过滤、trim 后空白按未传处理、与 keyword/level/source/project 权限叠加，以及 trace/span 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志 `request_id`/`user_id` 结构化 `attributes` 白名单字段精确过滤、trim 后空白按未传处理、业务 `payload` 同名字段不误命中、与 keyword/level/source/trace/span/project 权限叠加，以及 request/user 筛选条件进入 cursor 签名并在不匹配时返回 `422`、日志上下文同项目前后文、无权限/不存在隐藏和 `before`/`after` 参数校验、指标聚合窗口 avg/sum/min/max/count、窗口分桶、权限过滤、组合筛选、空结果、非法参数和 limit、MySQL/MariaDB 指标聚合窗口 SQL 编译为 `FLOOR(TIMESTAMPDIFF(...) / window_seconds)` UTC epoch 秒差下取整且不使用 `UNIX_TIMESTAMP(occurred_at)`、`ingest_records(project_id, kind, received_at, id)` 组合索引元数据与 SQLite 迁移结果、`ingest_records.kind` 字符串列兼容 `trace` kind、SQLite repository 约束、SQLite Alembic 升降级、ClickHouse compose 配置展开、ClickHouse init SQL 挂载和表名静态检查、MongoDB compose 配置展开、MongoDB init 脚本挂载和 events 索引静态检查、代码静态检查；真实 MySQL 联测曾发现未显式下取整会把 `00:00:59`、`00:04:59` 边界样本上浮到下一桶，本轮已在 SQL 编译层锁定修复；MySQL、ClickHouse、MongoDB 和 Redis 容器补验需在后续任务完成，MySQL dashboard/alert_rules 迁移/API CRUD、panel preview/templates、关键词搜索的非字符串 JSON 标量值、日志 attributes 白名单字段 JSON 精确过滤执行计划、trace 真实 MySQL 写入/统计/查询/拓扑执行计划和指标窗口聚合执行计划需后续真实库专项补验或扩展。
