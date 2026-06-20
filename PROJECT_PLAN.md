# 遥测应用项目计划书

版本：0.1.0  
日期：2026-06-20  
状态：草案  
目标环境：Windows 11 开发，Debian 部署  
约束基线：本计划书已参考 `C:\Users\q-lau\Documents\blog\agent.md` 的开发协作约束补齐；Nginx 部署方式和端口策略以本项目要求为准，后续实现阶段应在本项目维护等价的 `AGENT.md`。  

## 1. 项目概述

本项目计划建设一个面向应用、服务和基础设施的遥测平台，用于接收、存储、查询、展示和告警遥测数据。平台后端采用 Python，使用 uv 管理 Python 版本、依赖和虚拟环境；前端采用 React；部署环境为 Debian，使用 Docker 运行应用与数据服务，宿主机 Nginx 负责反向代理、TLS 终止和静态资源入口。

项目定位不是完整替代所有成熟可观测性套件，而是构建一个可控、可扩展、适合自有业务的轻量遥测系统。核心能力覆盖 metrics、logs、traces、events，并预留 OpenTelemetry 接入、Prometheus 风格指标、日志检索、链路追踪、仪表盘和告警等能力。

## 2. 建设目标

### 2.1 产品目标

1. 支持多来源遥测数据接入，包括应用 SDK、HTTP API、OpenTelemetry Collector、Agent、Webhook 和批量导入。
2. 支持指标、日志、链路追踪、事件四类核心遥测信号。
3. 支持按服务、环境、实例、版本、主机、容器、标签等维度查询和聚合。
4. 支持仪表盘、图表、服务拓扑、异常时间线、告警规则和通知。
5. 支持团队、项目、环境、数据源、权限、审计日志等管理能力。
6. 支持 Windows 11 本地开发和 Debian 生产部署。
7. 开发、测试和部署均避开常见端口，降低与本机或服务器已有服务冲突的概率。
8. 版本管理使用 Git 和 GitHub，应用版本号采用 `x.y.z` 语义化版本格式。

### 2.2 工程目标

1. 后端采用模块化架构，API、采集、处理、查询、告警任务解耦。
2. 前端采用 React 单页应用，提供稳定的状态管理、路由和数据可视化能力。
3. 数据库采用 MySQL 作为关系型主库，同时引入非关系型数据库承担高吞吐遥测数据、缓存和队列职责。
4. 所有服务具备 Docker 化运行能力，Debian 宿主机只直接运行 Nginx、Docker Engine 和必要的系统服务。
5. 提供本地开发、测试、预发、生产四类配置分层。
6. CI/CD 覆盖格式检查、静态检查、单元测试、构建、镜像发布和部署产物生成。
7. 文档覆盖开发启动、部署上线、运维备份、版本发布和故障排查。

### 2.3 开发协作约束

1. 文件读写、终端输入输出、数据库字符集和项目文档统一使用 UTF-8。
2. 面向用户的界面文案、说明文字、代码注释、README 和项目文档默认使用中文；命令、变量名、协议名、第三方产品名、API 字段和行业通用术语可保留英文。
3. 文件路径、目录名、对象存储 key、代码导入路径和真实存储文件名统一使用英文、数字、短横线或下划线；中文只作为展示名、标题、备注等字段保存和显示。
4. 环境相关配置必须通过配置文件或环境变量提供，包括端口、域名、数据库连接、CORS、Trusted Host、上传目录、API 地址、对象存储和通知渠道，不得硬编码在业务代码或启动脚本中。
5. 后端本地启动必须在 `backend` 目录使用 `uv run python main.py`，不得直接使用系统 Python、全局 Python 或手写的临时启动命令。
6. 本地开发服务默认端口为前端 `25173`、后端 `28117`、前端预览 `25174`，避免使用 `3000`、`5173`、`8000` 等常见开发端口，也避免复用其他本地项目已使用的端口。
7. 浏览器联调、接口联调或端到端验证完成后，必须关闭本次启动的前端、后端或预览服务，并确认 `25173`、`28117`、`25174` 等相关端口不再由本项目进程监听。
8. 公网部署是默认目标，数据库、Redis、后端调试端口、私有上传目录和内部管理端口不得直接暴露到公网。
9. 生产 Nginx 端口策略不套用 blog 项目中的 `80/443` 规则；本项目继续按第 9.2 和第 12.3 章使用非常见公网入口端口。
10. 实现过程中必须同步维护 `README.md`、`PROJECT_PLAN.md`、`PROJECT_PROGRESS.md` 和 `AGENT.md` 中受影响的内容。
11. 开发过程中如果发现缺少必要依赖，可根据既定技术栈和当前任务自行补全依赖、锁文件、配置和文档，不需要等待额外确认；新增依赖必须说明用途并纳入验证。
12. 后续执行 Git 操作时，不需要用户逐次确认；在符合当前任务和项目规则的前提下，可自行创建分支、stage、commit、tag、push 或发起发布相关操作。
13. 前端开发和后端开发应支持并行推进，但必须使用独立 Git worktree，避免共享工作树的分支、暂存区和未提交改动互相污染。
14. `AGENT_COMMUNICATION.md` 只由总 agent 维护；子 agent 只追加本地 ignored 的 `agents/runtime/*.log.md` 和可入库的 API 契约草案，不直接修改总沟通文件。
15. `agents/runtime/*.log.md` 只用于本地临时通信，不得 stage、commit 或 push；`agents/runtime/api-contracts/*.md` 用于可提交的前后端契约草案。
16. 开始编写代码、调整依赖或工程配置前，总 agent 必须启动对应开发子 agent；跨端任务必须同时启动前端开发子 agent 和后端开发子 agent。
17. 开发子 agent 启动信息、任务边界、负责目录、当前状态和例外原因必须由总 agent 记录到 `AGENT_COMMUNICATION.md`；子 agent 的过程信息写入本地运行时日志，不得只在对话中口头说明。
17. 前端开发 agent 和后端开发 agent 必须按需自行启动测试子 agent 进行验证；开发 agent 表示某一功能完成后，必须由总 agent 启动代码审计子 agent 进行审计。
18. 前端开发 agent 只允许在独立 worktree `..\telemetry-worktrees\frontend` 的 `feature/frontend-dev` 分支 commit 和 push；后端开发 agent 只允许在独立 worktree `..\telemetry-worktrees\backend` 的 `feature/backend-dev` 分支 commit 和 push。
18. 总 agent 负责将前后端开发分支合并到 `dev`，并在阶段验收、版本发布或必要稳定节点将 `dev` 合并到 `main`。
19. 总 agent 维护根目录 `VERSION`，前端开发 agent 维护 `frontend/VERSION`，后端开发 agent 维护 `backend/VERSION`；所有 `VERSION` 文件只允许纯 `x.y.z`。
20. 不要把临时方案伪装成最终方案；临时实现必须在 `PROJECT_PROGRESS.md` 中标明原因、影响范围和后续处理。

## 3. 参考依据

调研参考了遥测和可观测性生态的主流方向：

1. OpenTelemetry 将遥测信号组织为 traces、metrics、logs、baggage 等概念，并通过 Collector 进行接收、处理和导出，适合作为采集入口和协议兼容层。
2. Prometheus 生态在指标采集、PromQL 风格查询和告警规则方面成熟，适合作为指标模型和告警体验参考。
3. Grafana 在仪表盘、数据源、告警和可视化方面是事实上的产品体验参考。
4. ClickHouse 常用于日志、追踪和可观测性场景，适合高吞吐写入和大范围聚合查询。
5. MongoDB 的 time series collection 和文档模型适合保存结构变化较大的事件、设备上报或半结构化遥测载荷。
6. Redis Streams、缓存和限流能力适合作为短期缓冲、任务协调和实时订阅辅助组件。
7. uv 可用于 Python 项目、依赖、脚本、锁文件和 Python 版本管理。
8. React 官方推荐使用框架或现代构建工具启动新项目，Vite + React 适合作为本项目的前端开发基础。
9. Docker Compose 适合定义和运行多容器应用，便于本地和部署环境保持服务拓扑一致。
10. 版本号采用语义化版本 `MAJOR.MINOR.PATCH`，分别表达不兼容变更、向后兼容功能和向后兼容修复。

## 4. 功能范围

### 4.1 遥测数据接入

#### 4.1.1 HTTP Ingestion API

提供后端接收接口，用于应用、脚本、网关或第三方系统主动上报数据。

计划接口：

1. `POST /api/v1/ingest/metrics`
2. `POST /api/v1/ingest/logs`
3. `POST /api/v1/ingest/traces`
4. `POST /api/v1/ingest/events`
5. `POST /api/v1/ingest/batch`

关键能力：

1. API Key 鉴权。
2. 项目、环境和服务维度隔离。
3. 请求体大小限制。
4. 批量上报。
5. 幂等键支持。
6. 数据格式校验。
7. 错误数据落盘或死信队列。
8. 限流和配额。

#### 4.1.2 OpenTelemetry 接入

支持通过 OpenTelemetry Collector 将应用遥测转发到本平台。初期目标是兼容 OTLP HTTP，后续再支持 OTLP gRPC。

计划能力：

1. 接收 traces。
2. 接收 metrics。
3. 接收 logs。
4. 映射 resource attributes、scope attributes、span attributes。
5. 保留 trace id、span id、parent span id、service name、deployment environment 等关键字段。
6. 支持通过 Collector 做预处理、采样和转发。

#### 4.1.3 Agent 接入

后续可开发轻量 Agent，用于采集主机、进程、容器和日志文件。

计划能力：

1. 主机 CPU、内存、磁盘、网络指标。
2. Docker 容器状态和资源指标。
3. 指定日志文件 tail。
4. Windows 和 Linux 双平台支持。
5. 离线缓冲。
6. 自动重连。
7. Agent 版本上报。

#### 4.1.4 Webhook 和第三方系统接入

用于接入 GitHub、CI/CD、部署系统、监控系统、业务系统事件。

计划能力：

1. Webhook 签名校验。
2. 来源系统模板。
3. 字段映射规则。
4. 事件归一化。
5. 失败重试。

### 4.2 指标 Metrics

指标模块用于保存和分析数值型遥测数据。

核心能力：

1. 支持 counter、gauge、histogram、summary 基础类型。
2. 支持 service、env、host、instance、region、version、tag 等标签。
3. 支持时间范围选择和聚合窗口。
4. 支持 avg、sum、min、max、count、p50、p90、p95、p99 聚合。
5. 支持多序列对比。
6. 支持 Top N 查询。
7. 支持按标签 group by。
8. 支持异常点标记。
9. 支持指标元数据管理，包括单位、说明、推荐聚合方式、保留周期。
10. 支持指标查询收藏。

首批内置指标：

1. 请求量。
2. 错误率。
3. 响应时间。
4. Apdex 或近似用户体验评分。
5. CPU 使用率。
6. 内存使用率。
7. 磁盘使用率。
8. 网络吞吐。
9. 队列堆积。
10. 数据摄入速率。

### 4.3 日志 Logs

日志模块用于保存、检索、筛选和分析结构化或半结构化日志。

核心能力：

1. 支持 JSON 日志。
2. 支持纯文本日志并提取基础字段。
3. 支持 level、service、env、host、trace_id、span_id、request_id、user_id 等字段。
4. 支持关键词搜索。
5. 支持字段过滤。
6. 支持时间范围查询。
7. 支持上下文查看，即查看某条日志前后若干条日志。
8. 支持日志详情展开。
9. 支持从日志跳转到 trace。
10. 支持日志采样和保留策略。
11. 支持敏感字段脱敏。
12. 支持日志导出。

日志级别：

1. `trace`
2. `debug`
3. `info`
4. `warn`
5. `error`
6. `fatal`

### 4.4 链路追踪 Traces

链路追踪模块用于观察请求跨服务调用的耗时、错误和依赖关系。

核心能力：

1. trace 列表查询。
2. trace waterfall 视图。
3. span 详情。
4. 错误 span 高亮。
5. 慢 trace 筛选。
6. 服务名、操作名、状态码、耗时范围过滤。
7. trace 与日志互跳。
8. trace 与指标互跳。
9. 服务依赖拓扑。
10. 采样策略配置。
11. span attribute 检索。
12. 异常 trace 收藏和备注。

### 4.5 事件 Events

事件模块用于记录部署、配置变更、告警、故障、业务操作等离散事件。

核心能力：

1. 事件上报。
2. 事件类型管理。
3. 时间线展示。
4. 事件与服务、环境、版本关联。
5. 事件与告警、trace、日志关联。
6. 支持手动创建事件。
7. 支持 GitHub release、CI/CD deployment、feature flag change 等事件接入。
8. 支持事件影响范围和负责人字段。

事件类型：

1. `deployment`
2. `config_change`
3. `incident`
4. `alert`
5. `maintenance`
6. `business`
7. `security`
8. `custom`

### 4.6 仪表盘 Dashboards

仪表盘用于组合展示指标、日志、trace 和事件。

核心能力：

1. 创建、编辑、删除仪表盘。
2. 图表拖拽布局。
3. 支持折线图、柱状图、面积图、饼图、表格、单值、热力图、日志列表、trace 列表、事件时间线。
4. 支持全局时间范围。
5. 支持变量，如环境、服务、实例、版本。
6. 支持自动刷新。
7. 支持图表查询配置。
8. 支持仪表盘分享链接。
9. 支持只读模式。
10. 支持导入导出 JSON。
11. 支持模板仪表盘。

首批内置仪表盘：

1. 系统总览。
2. 服务总览。
3. API 性能。
4. 错误分析。
5. 主机资源。
6. 容器资源。
7. 数据摄入健康。
8. 告警态势。

### 4.7 告警 Alerting

告警模块用于基于遥测数据触发通知和事件记录。

核心能力：

1. 指标阈值告警。
2. 日志关键词或日志数量告警。
3. trace 慢请求告警。
4. 错误率告警。
5. 数据断流告警。
6. 告警规则启停。
7. 告警静默。
8. 告警抑制。
9. 告警分组。
10. 告警升级策略。
11. 告警恢复通知。
12. 告警历史。
13. 告警事件自动写入 events。

通知渠道：

1. 邮件。
2. Webhook。
3. 企业微信机器人。
4. 钉钉机器人。
5. 飞书机器人。
6. 后续可扩展短信或电话。

告警规则示例：

1. `5 分钟内 HTTP 5xx 错误率 > 3%`
2. `10 分钟内 p95 响应时间 > 1000ms`
3. `某服务 3 分钟无数据上报`
4. `error 日志数量 5 分钟内超过 100 条`
5. `trace 平均耗时 10 分钟内持续高于基线 50%`

### 4.8 服务目录和资产管理

核心能力：

1. 项目管理。
2. 环境管理，如 dev、test、staging、prod。
3. 服务管理。
4. 服务版本管理。
5. 实例管理。
6. 主机管理。
7. 容器管理。
8. 数据源管理。
9. 标签管理。
10. 负责人和团队绑定。

### 4.9 用户、团队和权限

核心能力：

1. 用户注册或管理员创建用户。
2. 登录、退出、刷新 token。
3. 密码策略。
4. API Key 管理。
5. 团队管理。
6. 角色管理。
7. 项目级权限。
8. 只读、编辑、管理员角色。
9. 审计日志。
10. 后续支持 SSO。

建议角色：

1. `owner`
2. `admin`
3. `editor`
4. `viewer`
5. `ingest_only`

### 4.10 查询语言与查询构造器

初期不自定义完整 DSL，先采用结构化查询构造器，降低实现复杂度。

计划能力：

1. 指标查询表单。
2. 日志过滤器。
3. trace 过滤器。
4. 原始 JSON 查询预览。
5. 查询模板保存。
6. 高级模式支持类 SQL 或表达式。

后续可设计统一查询 DSL，例如：

```text
metric http.server.duration p95 by service where env = "prod" range 1h
logs where level >= "error" and service = "api" range 30m
traces where duration_ms > 1000 and status = "error" range 2h
```

### 4.11 管理后台

核心能力：

1. 系统状态。
2. 数据库连接状态。
3. 数据摄入速率。
4. 队列积压。
5. 存储占用。
6. 数据保留策略。
7. 用户和团队管理。
8. API Key 管理。
9. 配置中心。
10. 审计日志。
11. 任务状态。

## 5. 非功能需求

### 5.1 性能

MVP 阶段目标：

1. 单节点每秒接收 500 到 2000 条遥测记录。
2. 常用指标查询在 2 秒内返回。
3. 常用日志查询在 3 秒内返回。
4. 单个仪表盘 10 个图表以内时，首屏 3 秒内可用。
5. 告警评估延迟小于 60 秒。

一期目标：

1. 单节点每秒接收 5000 到 10000 条遥测记录。
2. 支持按项目配置不同保留周期。
3. 支持查询预聚合或降采样数据。

### 5.2 可用性

1. 后端服务支持健康检查。
2. 容器支持自动重启。
3. 数据写入失败进入缓冲或死信表。
4. 告警任务可重复执行且幂等。
5. 关键配置通过环境变量注入。
6. 生产部署支持备份和恢复流程。

### 5.3 安全

1. 所有管理接口需要认证。
2. Ingestion API 需要 API Key 或签名认证。
3. API Key 只保存哈希。
4. 密码使用强哈希算法。
5. 支持 CORS 白名单。
6. 支持请求限流。
7. 支持审计日志。
8. 日志和事件支持敏感字段脱敏。
9. Nginx 负责 HTTPS。
10. 数据库账号最小权限。
11. 生产 `.env` 不进入 Git。
12. Trusted Host 必须按公网域名和端口配置。
13. Cookie、CSRF、SameSite、Secure、HttpOnly 策略必须按公网部署设计。
14. 日志不得输出密码、Token、Cookie、数据库连接串、对象存储签名 URL、API Key 明文或通知 Webhook 密钥。
15. 上传文件如果后续引入，必须校验 MIME、扩展名和文件头，私有文件必须经后端鉴权下载。
16. Markdown 或富文本如果后续引入，渲染结果必须进行 HTML sanitize。

### 5.4 可维护性

1. 后端按领域模块拆分。
2. 前端按页面、组件、API client、状态和图表模块拆分。
3. 数据库迁移可追踪。
4. 统一日志格式。
5. 统一错误码。
6. 文档与代码同步维护。
7. 引入测试和静态检查。

### 5.5 兼容性

1. Windows 11 支持本地开发。
2. Debian 支持生产部署。
3. 浏览器支持最新版 Chrome、Edge、Firefox。
4. 后端目标 Python 3.12 起步。
5. Node.js 版本固定在 LTS 版本。

## 6. 技术架构

### 6.1 总体架构

```text
Browser
  |
  | HTTPS / WSS
  v
Nginx on Debian host
  |
  | reverse proxy to non-common ports
  v
Docker network
  |
  +-- frontend static container or mounted build output, internal 25173
  +-- api service, Python, internal 28117
  +-- worker service, Python
  +-- scheduler service, Python
  +-- MySQL, metadata and relational data
  +-- ClickHouse, metrics/logs/traces analytical storage
  +-- MongoDB, events and flexible documents
  +-- Redis, cache, rate limit, streams, task broker
```

### 6.2 后端技术选型

建议选型：

1. Python 3.12。
2. uv 管理 Python、依赖、锁文件和脚本。
3. FastAPI 作为 HTTP API 框架。
4. Pydantic v2 做数据校验和配置模型。
5. SQLAlchemy 2.x 做 MySQL ORM 和 SQL 构造。
6. Alembic 做数据库迁移。
7. PyMySQL 或 asyncmy 作为 MySQL 驱动。
8. ClickHouse Connect 或 clickhouse-driver 访问 ClickHouse。
9. Motor 或 PyMongo 访问 MongoDB。
10. Redis Python client 访问 Redis。
11. Celery、Dramatiq、RQ 或自研轻量 worker 用于后台任务。
12. APScheduler 或独立 scheduler 用于周期任务。
13. structlog 或 logging JSON Formatter 做结构化日志。
14. pytest 做测试。
15. ruff 做格式化和 lint。
16. mypy 或 pyright 做类型检查。

后端服务拆分：

1. `api`：REST API、认证、查询、管理后台接口。
2. `ingest`：可与 `api` 合并或独立，用于高吞吐数据接收。
3. `worker`：异步处理、清洗、聚合、通知。
4. `scheduler`：告警评估、数据保留、汇总任务。
5. `migrations`：数据库迁移任务。

MVP 阶段可先将 `api` 和 `ingest` 放在同一 FastAPI 应用中，通过路由和模块隔离；当摄入压力上升后再拆成独立进程或服务。

后端分层边界：

1. `api`：请求参数、依赖注入、权限入口、响应模型。
2. `services`：业务用例和领域规则。
3. `repositories`：数据库访问，隔离 ORM、ClickHouse、MongoDB 和 Redis 细节。
4. `models`：SQLAlchemy 模型。
5. `schemas`：Pydantic DTO、请求模型和响应模型。
6. `providers` 或 `adapters`：邮件、Webhook、对象存储、外部 SDK、通知渠道。
7. `tasks`：后台任务、告警评估、清理任务、异步写入。

设计模式约束：

1. 使用 Repository 隔离数据访问和业务逻辑。
2. 使用 Service Layer 承载业务用例。
3. 使用 Strategy 切换存储、通知、采样、脱敏和查询优化策略。
4. 使用 Factory 创建数据库客户端、通知发送器、认证提供方等复杂对象。
5. 使用 Policy 统一权限判断、配额、限流和数据访问规则。
6. 使用 Observer/Event 在告警触发、部署事件、审计日志、缓存刷新之间解耦。
7. 使用 Adapter 隔离第三方 API、OpenTelemetry Collector、企业微信、钉钉和飞书。

禁止在路由函数、SQLAlchemy 模型或数据库 repository 中堆积业务规则。

### 6.3 前端技术选型

建议选型：

1. React。
2. TypeScript。
3. Vite。
4. React Router。
5. TanStack Query 管理服务端状态。
6. Zustand 或 Redux Toolkit 管理客户端状态。
7. ECharts、uPlot 或 Recharts 做图表。
8. TanStack Table 做表格。
9. React Hook Form + Zod 做表单。
10. Tailwind CSS 或 CSS Modules 做样式。
11. lucide-react 做图标。
12. Vitest + React Testing Library 做前端测试。
13. Playwright 做端到端测试。

前端主要页面：

1. 登录页。
2. 总览页。
3. Metrics 查询页。
4. Logs 查询页。
5. Traces 查询页。
6. Events 时间线页。
7. Dashboards 列表页。
8. Dashboard 编辑页。
9. Alerts 规则页。
10. Alerts 历史页。
11. Services 服务目录页。
12. Data Sources 数据源页。
13. API Keys 管理页。
14. Users 和 Teams 管理页。
15. System Admin 系统状态页。

前端业务模块建议：

```text
features/auth
features/projects
features/services
features/metrics
features/logs
features/traces
features/events
features/dashboards
features/alerts
features/admin
features/settings
```

前端分层边界：

1. 页面文件负责组合布局、路由参数和页面级数据装配，不堆积复杂业务逻辑。
2. 请求封装放在 `api` 或业务模块内的 client 文件。
3. 表单校验使用独立 schema。
4. 状态管理、展示组件、图表组件和业务规则尽量拆开。
5. 复杂图表配置应封装为可测试函数或 hook。

文件体量约束：

1. 普通源码文件建议不超过 300 行。
2. React 页面、复杂服务文件超过 400 行时必须评估拆分。
3. 单个函数建议不超过 60 行。
4. 一个文件只承担一个主要职责。
5. 同类逻辑复制 3 次以上，应抽取公共函数、类、hook、组件或策略。

### 6.4 数据库选型与职责

#### 6.4.1 MySQL

MySQL 作为关系型主库，负责强一致的元数据和管理数据。

存储内容：

1. 用户。
2. 团队。
3. 角色和权限。
4. 项目。
5. 环境。
6. 服务目录。
7. API Key 哈希。
8. 仪表盘定义。
9. 告警规则。
10. 通知渠道。
11. 审计日志索引。
12. 系统配置。

建议：

1. 使用 MySQL 8.4 LTS 或生产系统可稳定获得的 MySQL 8 版本。
2. 所有表使用 `utf8mb4`。
3. 使用 Alembic 管理 schema。
4. 对常用查询字段建立组合索引。
5. 对审计日志等增长表考虑按时间分区。

#### 6.4.2 ClickHouse

ClickHouse 作为高吞吐分析型存储，负责 metrics、logs、traces 的主要查询和聚合。

存储内容：

1. 指标样本。
2. 日志记录。
3. trace span。
4. 预聚合指标。
5. 数据摄入统计。

建议：

1. 按日期分区。
2. 按项目、环境、服务、时间排序。
3. 设置 TTL 控制保留周期。
4. 重点查询字段使用合适的 skip index 或物化视图。
5. 对高基数字段谨慎建索引。

#### 6.4.3 MongoDB

MongoDB 用于结构变化较大的事件、原始载荷、规则扩展配置和未来设备类遥测。

存储内容：

1. 原始事件。
2. Webhook 原始 payload。
3. 灵活 schema 的业务遥测。
4. 事件扩展属性。
5. 告警上下文快照。

建议：

1. 事件集合按时间字段建立索引。
2. 项目、环境、服务字段建立组合索引。
3. 大 payload 设置大小限制。
4. 对过期临时数据使用 TTL index。

#### 6.4.4 Redis

Redis 用于短期状态、缓存、限流和队列。

用途：

1. 登录会话或 refresh token 黑名单。
2. API Key 限流。
3. 查询缓存。
4. 告警状态缓存。
5. Redis Streams 作为摄入缓冲。
6. Worker 任务队列。
7. 实时订阅辅助。

注意：

1. Redis 不作为唯一持久化来源。
2. 生产开启 AOF 或 RDB，视用途决定。
3. 关键数据仍落 MySQL、ClickHouse 或 MongoDB。

## 7. 数据模型初稿

### 7.1 MySQL 核心表

```text
users
teams
team_members
roles
permissions
projects
environments
services
service_versions
api_keys
dashboards
dashboard_panels
alert_rules
alert_channels
alert_events
audit_logs
system_settings
```

### 7.2 ClickHouse 核心表

```text
metric_samples
metric_rollup_1m
metric_rollup_5m
log_records
trace_spans
ingest_stats
```

### 7.3 MongoDB 集合

```text
events
webhook_payloads
alert_snapshots
custom_telemetry
dead_letters
```

### 7.4 Redis Key 规划

```text
rate_limit:{api_key}:{window}
session:{user_id}:{token_id}
query_cache:{hash}
alert_state:{rule_id}
ingest_stream:metrics
ingest_stream:logs
ingest_stream:traces
ingest_stream:events
worker_lock:{job_name}
```

## 8. API 规划

### 8.1 认证

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
```

### 8.2 项目和服务

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{project_id}
PATCH  /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}

GET    /api/v1/services
POST   /api/v1/services
GET    /api/v1/services/{service_id}
PATCH  /api/v1/services/{service_id}
DELETE /api/v1/services/{service_id}
```

### 8.3 数据接入

```text
POST   /api/v1/ingest/metrics
POST   /api/v1/ingest/logs
POST   /api/v1/ingest/traces
POST   /api/v1/ingest/events
POST   /api/v1/ingest/batch
```

### 8.4 查询

```text
POST   /api/v1/query/metrics
POST   /api/v1/query/logs
POST   /api/v1/query/traces
POST   /api/v1/query/events
POST   /api/v1/query/topology
```

### 8.5 仪表盘

```text
GET    /api/v1/dashboards
POST   /api/v1/dashboards
GET    /api/v1/dashboards/{dashboard_id}
PATCH  /api/v1/dashboards/{dashboard_id}
DELETE /api/v1/dashboards/{dashboard_id}
POST   /api/v1/dashboards/{dashboard_id}/clone
```

### 8.6 告警

```text
GET    /api/v1/alerts/rules
POST   /api/v1/alerts/rules
GET    /api/v1/alerts/rules/{rule_id}
PATCH  /api/v1/alerts/rules/{rule_id}
DELETE /api/v1/alerts/rules/{rule_id}

GET    /api/v1/alerts/events
POST   /api/v1/alerts/silences
DELETE /api/v1/alerts/silences/{silence_id}
```

### 8.7 管理

```text
GET    /api/v1/admin/health
GET    /api/v1/admin/storage
GET    /api/v1/admin/ingest-stats
GET    /api/v1/admin/audit-logs
GET    /api/v1/admin/settings
PATCH  /api/v1/admin/settings
```

## 9. 端口规划

开发和部署均不要采用常见端口。避免使用 `80`、`443`、`3000`、`3306`、`5432`、`6379`、`8000`、`8080`、`9000`、`9090`、`27017` 等默认或常见端口作为对外暴露端口。

本项目也避免复用参考项目和早期草案中出现过的端口，例如 `14173`、`15173`、`18080`、`45173`、`48117`。下表端口作为默认规划值，后续必须通过环境变量或独立配置文件注入。

最终部署前必须在 Debian 宿主机执行端口占用检查。如果 `25173`、`25174`、`28117`、`23316`、`28123`、`29001`、`27018`、`26380`、`28081`、`28443` 与宿主机已有服务或其他项目冲突，应先调整 `.env.production`、Compose 配置和 Nginx 配置，再部署。

### 9.1 Windows 11 开发端口

| 服务 | 容器内端口 | 宿主机端口 | 说明 |
| --- | ---: | ---: | --- |
| Frontend Vite | 25173 | 25173 | 前端开发服务 |
| Frontend Preview | 25174 | 25174 | 前端构建预览服务 |
| Backend API | 28117 | 28117 | FastAPI 开发服务 |
| MySQL | 3306 | 23316 | 仅本机访问 |
| ClickHouse HTTP | 8123 | 28123 | 仅本机访问 |
| ClickHouse Native | 9000 | 29001 | 仅本机访问 |
| MongoDB | 27017 | 27018 | 仅本机访问 |
| Redis | 6379 | 26380 | 仅本机访问 |
| Mailpit 或测试邮件 | 8025 | 28025 | 可选 |

### 9.2 Debian 生产端口

Nginx 在宿主机监听外部端口。虽然 HTTPS 标准端口是 443，但本项目要求不要使用常见端口，因此生产对外入口建议使用非标准端口，例如：

| 服务 | 监听位置 | 端口 | 说明 |
| --- | --- | ---: | --- |
| Nginx HTTP redirect | 宿主机 | 28081 | 可选，仅跳转 |
| Nginx HTTPS | 宿主机 | 28443 | 对外入口 |
| Backend API | Docker 内部 | 28117 | 不直接暴露公网 |
| Frontend static | Docker 内部或宿主目录 | 25173 | 由 Nginx 代理或直接服务静态文件 |
| MySQL | Docker 内部 | 23316 | 仅 Docker 网络 |
| ClickHouse HTTP | Docker 内部 | 28123 | 仅 Docker 网络 |
| MongoDB | Docker 内部 | 27018 | 仅 Docker 网络 |
| Redis | Docker 内部 | 26380 | 仅 Docker 网络 |

生产环境原则：

1. 只有 Nginx 对公网开放。
2. 数据库端口不绑定 `0.0.0.0`。
3. Docker 服务使用内部网络名互通。
4. 如需远程维护数据库，使用 SSH tunnel，不直接暴露数据库端口。
5. 防火墙只放行必要端口。

## 10. 仓库结构规划

建议采用单仓库 monorepo。

```text
telemetry/
  backend/
    app/
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
      telemetry/
    tests/
    migrations/
    pyproject.toml
    uv.lock
    VERSION
    PROJECT_PROGRESS.md
    README.md
  frontend/
    src/
      app/
      pages/
      components/
      features/
      api/
      charts/
      hooks/
      stores/
      styles/
    public/
    package.json
    package-lock.json
    VERSION
    PROJECT_PROGRESS.md
    README.md
  deploy/
    docker/
      Dockerfile.backend
      Dockerfile.frontend
      compose.dev.yml
      compose.prod.yml
    nginx/
      telemetry.conf
    scripts/
      deploy.sh
      backup.sh
      restore.sh
  docs/
    architecture.md
    api.md
    deployment-debian.md
    development-windows.md
    operations.md
    release.md
  agents/
    frontend-agent.md
    backend-agent.md
    test-agent.md
    code-audit-agent.md
  .github/
    workflows/
      ci.yml
      docker.yml
  .env.example
  .gitignore
  AGENT.md
  AGENT_COMMUNICATION.md
  VERSION
  PROJECT_PLAN.md
  PROJECT_PROGRESS.md
  README.md
```

## 11. 开发环境规划

### 11.1 Windows 11 基础依赖

需要安装：

1. Git。
2. GitHub CLI，可选但推荐。
3. Python 由 uv 管理。
4. uv。
5. Node.js LTS。
6. npm，提交 `package-lock.json`，生产镜像使用 `npm ci`。
7. Docker Desktop。
8. Windows Terminal。
9. VS Code 或 JetBrains IDE。

编码要求：

1. 文件读写使用 UTF-8。
2. 终端输出使用 UTF-8。
3. Python 源文件默认 UTF-8。
4. 数据库字符集使用 `utf8mb4`。

PowerShell 建议：

```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
```

### 11.2 后端初始化

计划命令：

```powershell
cd backend
uv python install 3.12
uv init --package
uv add fastapi uvicorn pydantic pydantic-settings sqlalchemy alembic pymysql redis clickhouse-connect pymongo
uv add --dev pytest pytest-asyncio ruff mypy httpx
```

常用脚本：

```text
uv run ruff check .
uv run ruff format .
uv run pytest
uv run alembic upgrade head
uv run python main.py
```

`main.py` 负责从环境变量读取 `API_HOST` 和 `API_PORT`，本地默认监听 `127.0.0.1:28117`，不得在业务代码中硬编码端口。

### 11.3 前端初始化

计划命令：

```powershell
cd frontend
npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query @tanstack/react-table react-router-dom zustand echarts zod react-hook-form lucide-react
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom playwright eslint prettier typescript
npm run dev -- --host 127.0.0.1 --port 25173
npm run preview -- --host 127.0.0.1 --port 25174
```

修改 `package.json` 或 `package-lock.json` 后，必须考虑生产 Linux 镜像中的 `npm ci`。如果本机 Docker 不可用，应检查并补齐 Linux 所需 lock 条目，并在 `PROJECT_PROGRESS.md` 与最终说明中写明验证边界。

### 11.4 本地数据库

开发环境通过 Docker Compose 启动 MySQL、ClickHouse、MongoDB、Redis，端口映射使用第 9 章规划的非默认宿主机端口。

### 11.5 环境变量

`.env.example` 规划：

```text
APP_ENV=development
APP_VERSION=0.1.0
APP_SECRET_KEY=change-me

API_HOST=127.0.0.1
API_PORT=28117
FRONTEND_DEV_PORT=25173
FRONTEND_PREVIEW_PORT=25174

MYSQL_HOST=127.0.0.1
MYSQL_PORT=23316
MYSQL_DATABASE=telemetry
MYSQL_USER=telemetry_app
MYSQL_PASSWORD=change-me

CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_HTTP_PORT=28123
CLICKHOUSE_NATIVE_PORT=29001
CLICKHOUSE_DATABASE=telemetry
CLICKHOUSE_USER=telemetry_app
CLICKHOUSE_PASSWORD=change-me

MONGODB_URI=mongodb://telemetry_app:change-me@127.0.0.1:27018/telemetry
REDIS_URL=redis://127.0.0.1:26380/0

CORS_ORIGINS=http://127.0.0.1:25173,http://127.0.0.1:25174
PUBLIC_BASE_URL=https://example.com:28443
```

## 12. 部署规划

### 12.1 Debian 宿主机职责

宿主机直接安装：

1. Docker Engine。
2. Docker Compose plugin。
3. Nginx。
4. Certbot 或其他证书管理工具，可选。
5. UFW 或 nftables 防火墙。
6. 日志轮转和备份脚本。

宿主机不直接安装：

1. MySQL 服务。
2. MongoDB 服务。
3. Redis 服务。
4. ClickHouse 服务。
5. Python 应用运行环境。
6. Node.js 前端运行环境。

这些服务均通过 Docker 运行。

Nginx 是明确的例外：最终部署后，公网请求必须先进入 Debian 宿主机上的 Nginx，再由宿主机 Nginx 反向代理到 Docker 中的后端服务或前端静态资源；Nginx 不进入 Docker Compose，不使用 Docker 容器管理。

### 12.2 Docker 服务规划

生产 Compose 服务：

1. `telemetry-api`
2. `telemetry-worker`
3. `telemetry-scheduler`
4. `telemetry-mysql`
5. `telemetry-clickhouse`
6. `telemetry-mongodb`
7. `telemetry-redis`
8. `telemetry-frontend-build` 或静态文件卷

生产 Compose 禁止包含 Nginx 服务。Docker 只负责应用进程、后台任务、调度器、数据库、缓存和前端构建产物；入口代理、TLS、静态文件对外服务和公网访问控制由宿主机 Nginx 负责。

容器网络：

1. `telemetry-internal`：应用和数据库内部通信。
2. `telemetry-edge`：仅用于宿主机 Nginx 访问后端入口，或通过 host 访问指定绑定端口。

卷规划：

1. `mysql_data`
2. `clickhouse_data`
3. `mongodb_data`
4. `redis_data`
5. `backend_logs`
6. `frontend_dist`
7. `backup_data`

### 12.3 Nginx 规划

Nginx 在 Debian 宿主机运行，不使用 Docker 管理。最终公网入口必须由宿主机 Nginx 承担，Docker 内的 `telemetry-api`、前端静态产物和其他内部服务不得直接面向公网。

职责：

1. 监听非标准 HTTPS 端口，例如 `28443`。
2. TLS 终止。
3. 静态文件服务。
4. `/api/` 反向代理到后端。
5. `/ingest/` 可独立限流。
6. WebSocket 或 SSE 代理。
7. gzip 或 brotli 压缩。
8. 请求体大小限制。
9. 安全响应头。
10. 访问日志和错误日志。

示例路由：

```text
https://domain.example:28443/             -> frontend static
https://domain.example:28443/api/         -> telemetry-api:28117
https://domain.example:28443/ingest/      -> telemetry-api:28117
https://domain.example:28443/live/        -> telemetry-api:28117
```

### 12.4 备份与恢复

备份对象：

1. MySQL 全量备份。
2. ClickHouse 分区或快照备份。
3. MongoDB dump。
4. Redis 持久化文件，视用途决定。
5. `.env.production`。
6. Nginx 配置。
7. 上传或导出的用户配置。

备份策略：

1. 每日增量或逻辑备份。
2. 每周全量备份。
3. 备份文件加密。
4. 至少保留 7 天每日备份和 4 周每周备份。
5. 每月至少演练一次恢复。

## 13. Git、GitHub 与版本管理

### 13.1 分支策略

建议：

1. `main`：稳定分支，只保留可发布版本。
2. `dev`：日常开发和集成分支。
3. `feature/frontend-dev`：前端开发 agent 专属分支。
4. `feature/backend-dev`：后端开发 agent 专属分支。
5. `feature/*`：其他由总 agent 明确分派的功能开发。
6. `fix/*`：缺陷修复。
7. `release/x.y.z`：发布准备。
8. `hotfix/x.y.z`：生产紧急修复。

协作规则：

1. GitHub remote 默认命名为 `origin`。
2. 初始仓库优先创建为私有仓库，确认可公开后再调整可见性。
3. 一个完整功能完成、验证通过并提交推送后，再从 `dev` 合并到 `main`。
4. 不要等到累计大量代码后再提交；按“完成一个可验证小步就 commit 并 push”的节奏推进。
5. 提交前必须检查 `git status`，避免混入无关改动。
6. 提交前必须检查本次改动是否影响 `README.md`、`PROJECT_PLAN.md`、`PROJECT_PROGRESS.md`、`AGENT.md` 或子目录 README。
7. 必须维护 `.gitignore`，禁止提交 `.env`、密钥、证书私钥、依赖目录、构建产物、上传文件和备份文件。
8. 应提交依赖锁文件，例如后端 `uv.lock`、前端 `package-lock.json`。
9. 执行 Git 操作不需要用户逐次确认，但不得跳过状态检查、文档同步、锁文件同步和敏感文件排查。
10. 前端开发 agent 只允许向 `feature/frontend-dev` commit 和 push。
11. 后端开发 agent 只允许向 `feature/backend-dev` commit 和 push。
12. 开发 agent 不得直接向 `dev` 或 `main` commit、push 或 merge。
13. 总 agent 负责合并 `feature/frontend-dev` 和 `feature/backend-dev` 到 `dev`。
14. 总 agent 仅在阶段验收、版本发布或必要稳定节点将 `dev` 合并到 `main`。
15. 分支合并、冲突解决、`dev` 到 `main` 的提升和 tag 发布必须由总 agent 执行。
16. 分支切换由拥有对应写入范围的 agent 自行执行并记录；总 agent 不替子 agent 切换分支，子 agent 不替孙 agent 切换分支，多个 agent 不得同时切换分支。
17. 不允许长期累积未提交改动；完成一个可验证小步后，负责该写入范围的 agent 必须自行检查状态、文档、锁文件和敏感文件，并按所属分支提交和尽量推送。
18. 若因共享工作树、分支切换锁、审计未通过或阻塞问题暂不能提交，必须在 `AGENT_COMMUNICATION.md` 和对应进度文件记录原因、影响范围和下一次提交条件。
19. 开发型 agent 必须在独立 Git worktree 中工作，根工作树只用于总 agent 汇总、集成、合并和发布。
20. 默认独立 worktree 由 `scripts/Initialize-AgentWorktrees.ps1` 创建：前端为 `..\telemetry-worktrees\frontend`，后端为 `..\telemetry-worktrees\backend`。

### 13.2 提交规范

采用 Conventional Commits 类型前缀，但冒号后的说明使用中文：

```text
feat: 添加指标摄入接口
fix: 修复告警恢复状态判断
docs: 更新 Debian 部署说明
test: 补充 trace 查询测试
refactor: 拆分摄入服务
chore: 更新依赖版本
```

如果无法创建 GitHub 仓库、commit 或 push，必须写入 `PROJECT_PROGRESS.md`，并在最终说明中说明原因。

### 13.3 版本号

版本号格式：`x.y.z`，应用自身版本号不使用 `alpha`、`beta`、`rc` 等后缀。

规则：

1. `x`：主版本，出现不兼容 API、数据结构或部署方式变更时递增。
2. `y`：次版本，新增向后兼容功能时递增。
3. `z`：修订版本，向后兼容的问题修复时递增。

示例：

1. `0.1.0`：首个 MVP 开发版本。
2. `0.2.0`：新增日志检索和仪表盘编辑。
3. `0.2.1`：修复日志查询时间范围问题。
4. `1.0.0`：达到生产可用基线。

发布规则：

1. Git tag 和发布名称采用 `vX.Y.Z` 形式。
2. 非正式版一律使用 `v0.y.z`，例如 `v0.1.0`，不使用预发布后缀。
3. 正式稳定发布从 `v1.0.0` 开始。
4. 修改数据库结构、API 契约、部署方式或安全策略时，必须同步记录版本影响。
5. 未达到可上线稳定版本前，所有应用版本必须采用 `0.y.z`，不得发布 `1.y.z` 或更高主版本。
6. 达到可上线标准并完成生产部署验收后，首个稳定版本定为 `1.0.0`。
7. 每次版本号变化都必须同步更新 `PROJECT_PLAN.md`、`README.md`、`PROJECT_PROGRESS.md`、后端版本声明、前端 `package.json`、`.env.example` 中的 `APP_VERSION` 以及发布说明。
8. 如果某次改动影响数据库迁移、API 契约、部署端口、安全策略或数据保留策略，版本影响必须写入 `PROJECT_PROGRESS.md`，发布时同步写入 changelog。
9. 根目录 `VERSION` 由总 agent 维护，表示项目总版本。
10. `frontend/VERSION` 由前端开发 agent 维护，表示前端版本。
11. `backend/VERSION` 由后端开发 agent 维护，表示后端版本。
12. 所有 `VERSION` 文件只能包含纯 `x.y.z`，不得包含任何后缀。
13. 前端或后端版本变化后，总 agent 必须判断是否同步提升根目录 `VERSION`，并记录差异原因。

### 13.4 GitHub Actions

CI 工作流：

1. 后端 ruff check。
2. 后端 ruff format check。
3. 后端 mypy。
4. 后端 pytest。
5. 前端 lint。
6. 前端 typecheck。
7. 前端 test。
8. Docker build。

发布工作流：

1. 创建 tag `vX.Y.Z`。
2. 生成 changelog。
3. 构建后端镜像。
4. 构建前端镜像或静态产物。
5. 推送镜像到 GitHub Container Registry。
6. 创建 GitHub Release。

## 14. 多 Agent 协作机制

### 14.1 Agent 分工

1. 总 agent：指导并协调整个开发过程，负责拆分任务、维护 `AGENT_COMMUNICATION.md`、协调前后端并行、汇总测试记录、启动代码审计子 agent、决定是否进入提交或下一阶段。
2. 前端开发 agent：负责 React 前端实现，维护页面、组件、状态、图表、API client、前端文档和 `frontend/PROJECT_PROGRESS.md`。
3. 后端开发 agent：负责 Python 后端实现，维护 API、数据库迁移、数据接入、查询、告警、后台任务、后端文档和 `backend/PROJECT_PROGRESS.md`。
4. 测试 agent：负责设计并执行验证方案，记录测试结果、失败原因和无法验证的边界。
5. 代码审计 agent：负责功能完成后的代码审计，重点检查 bug、风险、安全、架构、测试缺口和文档同步。

### 14.2 并行开发流程

1. 总 agent 在任务开始时读取 `PROJECT_PLAN.md`、`AGENT.md`、专项 agent 文件和 `AGENT_COMMUNICATION.md`。
2. 总 agent 将任务拆成前端、后端、测试和审计事项，并写入 `AGENT_COMMUNICATION.md`。
3. 总 agent 在开始编写代码前启动相关开发子 agent，并在 `AGENT_COMMUNICATION.md` 记录子 agent 名称、负责范围和状态；跨端任务必须分别启动前端开发子 agent 和后端开发子 agent。
4. 前端开发 agent 和后端开发 agent 可同时推进开发，但必须分别在独立 worktree 内工作。
5. 前后端所有 API 契约、字段、错误码、权限、分页、筛选和阻塞问题必须先写入 `agents/runtime/api-contracts/` 草案；过程性讨论写入本地 ignored 的 `agents/runtime/*.log.md`。
6. 后端修改接口契约时，必须更新 `agents/runtime/api-contracts/backend.md`；前端提出接口需求时，必须更新 `agents/runtime/api-contracts/frontend-requests.md`。
7. 任一 agent 发现契约冲突，先在自己的本地运行时日志中记录，由总 agent 在 `AGENT_COMMUNICATION.md` 记录决议。
8. 前端开发 agent 维护 `frontend/PROJECT_PROGRESS.md`，后端开发 agent 维护 `backend/PROJECT_PROGRESS.md`。
9. 总 agent 必须定时探测前后端进度文件，并将新增进展、阻塞、验证、审计结论和下一步合并摘要到根目录 `PROJECT_PROGRESS.md`。
10. 前端开发 agent 只在 `feature/frontend-dev` 分支工作，后端开发 agent 只在 `feature/backend-dev` 分支工作。
11. 开发 agent 需要合并时，只能在 `AGENT_COMMUNICATION.md` 中提出请求；总 agent 负责合并到 `dev`。
12. 总 agent 不代替子 agent 执行开发、测试、构建、格式化或本地服务启动命令；子 agent 不代替孙 agent 执行其负责的测试、审计或修复任务，只接收结论并整合记录。
13. 需要切换分支时，由负责当前写入范围的 agent 自行执行并登记，避免多个 agent 同时切换分支。
14. 负责写入范围的 agent 在可验证小步完成后负责提交和尽量推送；总 agent 不替开发子 agent 提交其范围内的普通开发改动。
15. 子 agent 不直接修改 `AGENT_COMMUNICATION.md`；过程记录、验证结果和提交信息先写入自己的本地运行时日志，总 agent 再汇总稳定结论。

### 14.3 测试与审计流转

1. 前端开发 agent 和后端开发 agent 在开发过程中遇到验证需求时，必须自行启动测试子 agent 进行测试。
2. 测试子 agent 根据变更风险执行必要测试，不机械执行无关全量测试。
3. 测试结果必须写入 `AGENT_COMMUNICATION.md` 和对应的前端或后端 `PROJECT_PROGRESS.md`。
4. 开发 agent 表示某一功能完成后，总 agent 必须启动代码审计子 agent。
5. 代码审计子 agent 审计通过后，总 agent 才能将功能标记为完成。
6. 审计未通过时，总 agent 将问题分派给对应开发 agent，修复后重新测试并重新审计。
7. 总 agent 在测试和审计节点后必须合并根目录 `PROJECT_PROGRESS.md`。
8. 测试命令由测试 agent 或对应开发 agent 在其负责边界内执行；总 agent 不为子 agent 代跑验证命令，审计 agent 也不代跑开发 agent 或测试 agent 的验证命令。

### 14.4 沟通文件规则

`AGENT_COMMUNICATION.md` 是唯一正式汇总沟通板，只由总 agent 修改。子 agent 使用本地 ignored 的 `agents/runtime/*.log.md` 追加分片日志，API 契约草案使用 `agents/runtime/api-contracts/`，至少维护以下正式汇总内容：

1. 当前任务看板。
2. API 契约登记。
3. 前后端对齐记录。
4. 测试记录。
5. 审计记录。
6. 阻塞问题。
7. 决策记录。

不得删除历史记录；已完成或已关闭事项应通过状态标记。

运行时分片日志规则：

1. 前端开发 agent 追加本地文件 `agents/runtime/frontend-agent.log.md`。
2. 后端开发 agent 追加本地文件 `agents/runtime/backend-agent.log.md`。
3. 测试 agent 追加本地文件 `agents/runtime/test-agent.log.md`。
4. 代码审计 agent 追加本地文件 `agents/runtime/code-audit-agent.log.md`。
5. 后端 API 契约草案写入 `agents/runtime/api-contracts/backend.md`。
6. 前端 API 需求草案写入 `agents/runtime/api-contracts/frontend-requests.md`。
7. `*.log.md` 已进入 `.gitignore`，不得提交或推送；`api-contracts/*.md` 可以随接口变更提交。
8. 总 agent 读取分片日志后，统一合并稳定结论到 `AGENT_COMMUNICATION.md` 和根 `PROJECT_PROGRESS.md`。

### 14.5 进度文件规则

1. `frontend/PROJECT_PROGRESS.md` 由前端开发 agent 维护。
2. `backend/PROJECT_PROGRESS.md` 由后端开发 agent 维护。
3. 根目录 `PROJECT_PROGRESS.md` 由总 agent 维护，作为项目级汇总。
4. 总 agent 在任务开始、测试完成、审计完成、准备 Git 提交前都必须探测前后端进度文件。
5. 根目录汇总应保留摘要，不逐字复制全部子进度；但必须包含完成事项、阻塞风险、验证结果、审计结论和下一步。
6. 如果子进度文件缺失、过期或互相冲突，总 agent 必须在 `AGENT_COMMUNICATION.md` 记录问题和决议。
7. 前后端分支的合并请求、合并状态和冲突处理必须记录在 `AGENT_COMMUNICATION.md`。

### 14.6 版本文件规则

1. 根目录 `VERSION` 由总 agent 维护，表示项目总版本。
2. `frontend/VERSION` 由前端开发 agent 维护，表示前端版本。
3. `backend/VERSION` 由后端开发 agent 维护，表示后端版本。
4. 所有 `VERSION` 文件只能包含纯 `x.y.z`，不得包含后缀。
5. 未达到可上线稳定版本前，三个版本文件都必须保持 `0.y.z`。
6. 前端或后端版本变化后，对应开发 agent 必须更新子进度文件并通知总 agent。
7. 总 agent 在发布、合并到 `main` 或创建 tag 前，必须校验三个 `VERSION` 文件和发布说明。

## 15. 测试策略

每次实现、重构、测试或部署调整后，都必须先在对应子进度文件中记录进度。前端变更记录到 `frontend/PROJECT_PROGRESS.md`，后端变更记录到 `backend/PROJECT_PROGRESS.md`，跨端和项目级变更由总 agent 汇总到根目录 `PROJECT_PROGRESS.md`。记录内容至少包括当前日期、已完成事项、正在进行事项、阻塞问题或风险、下一步计划、涉及的主要文件或模块、已执行的验证方式。

`PROJECT_PROGRESS.md` 推荐格式：

```markdown
## 2026-06-20

### 已完成

- 完成指标摄入接口。

### 进行中

- 接入 ClickHouse 批量写入。

### 阻塞与风险

- 待确认生产域名和证书申请方式。

### 下一步

- 补充指标摄入 API 测试。

### 验证

- 已运行 `uv run pytest tests/ingest`。
```

每完成一个可验证任务后，必须在“下一步”中写清楚紧接着要推进的具体任务，不能只写“继续完善”“后续优化”等模糊表述。

### 15.1 后端测试

1. 单元测试：数据校验、查询构造、权限判断、告警规则计算。
2. 集成测试：MySQL、ClickHouse、MongoDB、Redis 交互。
3. API 测试：认证、项目、摄入、查询、仪表盘、告警。
4. 性能测试：摄入吞吐、查询延迟、告警评估延迟。
5. 安全测试：越权、无效 API Key、限流、CORS。

### 15.2 前端测试

1. 组件测试。
2. 表单校验测试。
3. API client 测试。
4. 路由守卫测试。
5. 图表渲染测试。
6. E2E 测试：登录、查询日志、查看 trace、创建仪表盘、创建告警。

### 15.3 部署验证

1. Docker Compose 启动成功。
2. Nginx 反向代理成功。
3. 前端可访问。
4. API health check 成功。
5. MySQL migration 成功。
6. 遥测数据可写入。
7. 仪表盘可展示数据。
8. 告警可触发测试通知。

如果某项验证无法执行，必须在最终说明和 `PROJECT_PROGRESS.md` 中记录原因、影响范围和后续补验方式。

### 15.4 重构触发条件

出现以下情况时应优先考虑重构：

1. 文件职责混乱，包含路由、业务、数据库、外部 SDK、安全逻辑等多类职责。
2. 新增功能需要修改多个无关模块。
3. 单元测试难写，需要大量 mock 内部实现。
4. 复制粘贴明显增加。
5. 权限、文件访问、日志、限流等横切逻辑散落。

重构要求：

1. 先记录重构原因和影响范围。
2. 尽量保持外部行为不变。
3. 重构后补充或保留测试。
4. 更新 `PROJECT_PROGRESS.md`。

### 15.5 文档同步要求

以下变更必须同步更新文档：

1. 项目总览、启动方式、目录结构和当前阶段变化。
2. 架构边界变化。
3. 数据表变化。
4. API 变化。
5. 部署方式变化。
6. 安全策略变化。
7. 文件存储策略变化。
8. 影响开发流程的规范变化。

## 16. 里程碑计划

### 16.1 阶段 0：项目初始化

目标版本：`0.1.0`

任务：

1. 创建后端 uv 项目。
2. 创建前端 React 项目。
3. 创建 Docker Compose 开发环境。
4. 创建基础目录结构。
5. 添加 `.env.example`。
6. 添加 GitHub Actions 基础 CI。
7. 添加 README 和开发文档。
8. 添加代码格式化和 lint。

验收标准：

1. Windows 11 可一键启动开发依赖。
2. 后端 health check 返回正常。
3. 前端页面可访问。
4. CI 能运行基础检查。

### 16.2 阶段 1：认证与基础管理

目标版本：`0.1.1`

任务：

1. 用户登录。
2. JWT 或 session 机制。
3. 用户、团队、项目、环境、服务 CRUD。
4. API Key 创建和撤销。
5. MySQL migration。
6. 审计日志基础能力。

验收标准：

1. 管理员可以创建项目和服务。
2. API Key 可用于数据上报。
3. 越权请求被拒绝。

### 16.3 阶段 2：数据接入 MVP

目标版本：`0.1.2`

任务：

1. metrics ingestion。
2. logs ingestion。
3. events ingestion。
4. ClickHouse 表初始化。
5. MongoDB events 集合初始化。
6. Redis 限流。
7. 摄入统计。

验收标准：

1. 能通过 HTTP API 上报 metrics、logs、events。
2. 错误 payload 返回清晰错误。
3. 摄入统计可在后台查看。

### 16.4 阶段 3：查询与展示 MVP

目标版本：`0.2.0`

任务：

1. 指标查询 API。
2. 日志查询 API。
3. 事件查询 API。
4. 前端总览页。
5. Metrics 查询页。
6. Logs 查询页。
7. Events 时间线页。

验收标准：

1. 可选择时间范围查询数据。
2. 可按服务、环境、标签过滤。
3. 图表和列表展示稳定。

### 16.5 阶段 4：Trace 和关联分析

目标版本：`0.3.0`

任务：

1. trace ingestion。
2. trace span 存储。
3. trace 查询。
4. waterfall 视图。
5. trace 与日志互跳。
6. 服务拓扑初版。

验收标准：

1. 可查看完整 trace。
2. 慢 trace 和错误 trace 可筛选。
3. 日志可按 trace id 关联。

### 16.6 阶段 5：仪表盘

目标版本：`0.4.0`

任务：

1. Dashboard CRUD。
2. Panel 配置。
3. 图表布局。
4. 变量和时间范围。
5. 内置模板。
6. JSON 导入导出。

验收标准：

1. 用户可创建自定义仪表盘。
2. 仪表盘可保存和重新打开。
3. 内置服务总览仪表盘可用。

### 16.7 阶段 6：告警

目标版本：`0.5.0`

任务：

1. 告警规则 CRUD。
2. 指标阈值告警。
3. 日志数量告警。
4. 数据断流告警。
5. 通知渠道。
6. 告警历史。
7. 静默和恢复通知。

验收标准：

1. 告警规则能按周期执行。
2. 告警触发和恢复都有记录。
3. 至少一个 Webhook 通知渠道可用。

### 16.8 阶段 7：生产部署

目标版本：`0.6.0`

任务：

1. 生产 Dockerfile。
2. 生产 Compose。
3. Nginx 配置。
4. Debian 部署文档。
5. 备份脚本。
6. 恢复脚本。
7. 日志轮转。
8. 安全加固。

验收标准：

1. Debian 服务器可完成部署。
2. 仅 Nginx 对公网开放。
3. 应用入口使用非常见端口。
4. 备份和恢复经过演练。

### 16.9 阶段 8：1.0 发布

目标版本：`1.0.0`

任务：

1. 补齐核心测试。
2. 性能压测。
3. 安全文档。
4. 运维手册。
5. 用户手册。
6. 发布 changelog。
7. 创建 GitHub Release。

验收标准：

1. MVP 到一期功能稳定。
2. 主要工作流有测试覆盖。
3. 可在生产环境持续运行。

## 17. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 遥测数据量增长过快 | 查询变慢、存储膨胀 | ClickHouse TTL、分区、预聚合、采样 |
| 标签基数过高 | 指标查询退化 | 限制标签数量，监控高基数字段 |
| 多数据库增加运维复杂度 | 部署和备份复杂 | 文档化、脚本化、明确职责边界 |
| 告警噪音过大 | 用户忽略告警 | 静默、分组、抑制、恢复通知 |
| Windows 和 Debian 环境差异 | 本地可用但生产失败 | Docker 化、CI、部署验收脚本 |
| 非标准端口影响访问 | 用户记忆成本增加 | Nginx 明确入口、文档和 DNS 配置 |
| Trace 数据存储成本高 | 存储快速增长 | 采样、TTL、只保留关键字段 |
| 自定义查询语言过早设计 | 实现成本高 | 初期使用结构化查询构造器 |

## 18. 初始优先级

P0：

1. 项目初始化。
2. Docker 开发环境。
3. 用户认证。
4. 项目、环境、服务、API Key。
5. metrics/logs/events ingestion。
6. 基础查询。
7. 总览页。

P1：

1. ClickHouse 优化。
2. trace ingestion 和 waterfall。
3. 仪表盘。
4. 告警规则。
5. 通知渠道。
6. Debian 部署。

P2：

1. OpenTelemetry Collector 深度兼容。
2. Agent。
3. 服务拓扑增强。
4. SSO。
5. 高级查询 DSL。
6. 多租户计费或配额。

## 19. 成功标准

项目达到 `1.0.0` 时应满足：

1. 能在 Debian 服务器通过 Docker 部署。
2. Nginx 在宿主机提供统一 HTTPS 入口，且入口使用非常见端口。
3. Windows 11 可完成完整本地开发流程。
4. API 可接收 metrics、logs、traces、events。
5. 用户可通过 React 前端查询和分析遥测数据。
6. 用户可创建仪表盘和告警。
7. MySQL、ClickHouse、MongoDB、Redis 分工明确。
8. GitHub Actions 能完成基础质量检查。
9. 版本号和发布流程符合 `x.y.z` 规则。
10. 有部署、备份、恢复、故障排查文档。

## 20. 下一步行动

建议下一步从阶段 0 开始执行：

1. 创建后端 uv 项目骨架。
2. 创建前端 React + TypeScript + Vite 项目骨架。
3. 添加开发 Docker Compose。
4. 添加非默认端口 `.env.example`。
5. 添加 health check。
6. 添加基础 CI。
7. 更新 README，写明 Windows 11 开发启动方式。

## 21. 参考链接

1. OpenTelemetry Signals: https://opentelemetry.io/docs/concepts/signals/
2. OpenTelemetry Collector: https://opentelemetry.io/docs/collector/
3. Prometheus Alerting Rules: https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
4. Grafana Documentation: https://grafana.com/docs/grafana/latest/
5. uv Documentation: https://docs.astral.sh/uv/
6. FastAPI Documentation: https://fastapi.tiangolo.com/
7. React Documentation: https://react.dev/
8. Vite Documentation: https://vite.dev/
9. Docker Compose Documentation: https://docs.docker.com/compose/
10. Docker Engine on Debian: https://docs.docker.com/engine/install/debian/
11. Nginx Reverse Proxy Guide: https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/
12. MySQL JSON Data Type: https://dev.mysql.com/doc/refman/8.4/en/json.html
13. ClickHouse Observability: https://clickhouse.com/docs/use-cases/observability
14. MongoDB Time Series Collections: https://www.mongodb.com/docs/manual/core/timeseries-collections/
15. Redis Streams: https://redis.io/docs/latest/develop/data-types/streams/
16. Semantic Versioning: https://semver.org/
