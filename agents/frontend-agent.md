# 前端开发 Agent

本文件定义遥测项目前端开发 agent 的职责、边界和工作流程。前端开发必须遵守根目录 `AGENT.md`、`PROJECT_PLAN.md` 和 `AGENT_COMMUNICATION.md`。

## 1. 职责

1. 实现 React + TypeScript + Vite 前端功能。
2. 维护前端路由、页面、组件、表单、状态、图表和 API client。
3. 与后端开发 agent 通过 `AGENT_COMMUNICATION.md` 对齐 API 契约。
4. 开发过程中主动请求测试 agent 执行相关验证。
5. 功能完成后向总 agent 标记“待审计”，由总 agent 启动代码审计 agent。
6. 同步更新前端 README、项目文档、`frontend/PROJECT_PROGRESS.md` 和版本信息。
7. 只允许在 `feature/frontend-dev` 分支提交和推送前端相关改动。
8. 维护 `frontend/VERSION`，版本号必须为纯 `x.y.z` 且上线前保持 `0.y.z`。

## 2. 技术约束

1. 使用 React、TypeScript、Vite。
2. 使用 npm 管理依赖，提交 `package-lock.json`。
3. 生产镜像必须能执行 `npm ci`。
4. 本地开发端口默认 `25173`，预览端口默认 `25174`。
5. 前端 API 地址、CORS 来源、公开基础路径必须从环境变量读取。
6. 不得硬编码后端地址、端口、域名或密钥。

## 3. 推荐模块结构

```text
frontend/src/
  app/
  pages/
  components/
  features/
    auth/
    projects/
    services/
    metrics/
    logs/
    traces/
    events/
    dashboards/
    alerts/
    admin/
    settings/
  api/
  charts/
  hooks/
  stores/
  styles/
```

## 4. 开发流程

1. 开始任务前读取 `AGENT_COMMUNICATION.md` 的任务看板、API 契约、阻塞问题和测试记录。
2. 如果后端接口尚未确定，先在“API 契约登记”中提出所需路径、请求体、响应体和错误码。
3. 实现页面前先确认路由、权限、加载态、空状态、错误态和刷新策略。
4. 新增依赖时同步更新 `package.json`、`package-lock.json` 和相关文档。
5. 修改 `package.json` 或 `package-lock.json` 后，必须考虑 Linux 镜像里的 `npm ci`。
6. 完成实现后，请测试 agent 执行 lint、typecheck、build、组件测试或 E2E 验证。
7. 测试通过或验证边界记录完成后，向总 agent 标记待审计。
8. 每次实现、重构、测试或依赖调整后，必须更新 `frontend/PROJECT_PROGRESS.md`；根目录 `PROJECT_PROGRESS.md` 由总 agent 合并维护。
9. 提交前必须确认当前分支为 `feature/frontend-dev`；不得直接向 `dev` 或 `main` commit、push 或 merge。
10. 需要合并到 `dev` 时，只能在 `AGENT_COMMUNICATION.md` 中向总 agent 发起合并请求。
11. 前端版本变化时，必须同步更新 `frontend/VERSION`、`package.json`、`frontend/PROJECT_PROGRESS.md`，并通知总 agent 判断是否提升根目录 `VERSION`。

## 5. 质量要求

1. 页面文件只负责组合，不堆积复杂业务逻辑。
2. 请求、表单校验、状态管理、展示组件和图表配置应拆分。
3. 普通源码文件建议不超过 300 行。
4. React 页面或复杂服务文件超过 400 行时必须评估拆分。
5. 单个函数建议不超过 60 行。
6. 同类逻辑复制 3 次以上，应抽取 hook、组件、工具函数或策略。
7. UI 文案默认中文，命令、字段、协议和第三方产品名可保留英文。

## 6. 与测试 Agent 协作

开发过程中必须在以下情况请求测试 agent：

1. 新增或修改 API client。
2. 新增核心页面或复杂组件。
3. 修改认证、权限、路由守卫或会话逻辑。
4. 修改图表查询、筛选、时间范围或刷新逻辑。
5. 修改 `package.json` 或 `package-lock.json`。
6. 准备标记功能完成前。

测试 agent 的验证结果必须写入 `AGENT_COMMUNICATION.md` 和 `frontend/PROJECT_PROGRESS.md`，再由总 agent 合并摘要到根目录 `PROJECT_PROGRESS.md`。

## 7. 完成标准

前端功能只有同时满足以下条件才可声明完成：

1. UI、交互、加载态、错误态和空状态已实现。
2. API 契约已在沟通文件中关闭或确认。
3. 相关测试已执行，或验证边界已记录。
4. 文档和进度已更新。
5. 已向总 agent 发起代码审计请求。
6. 相关提交只存在于 `feature/frontend-dev`，合并由总 agent 处理。
