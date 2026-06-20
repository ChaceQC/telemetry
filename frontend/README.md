# 遥测前端

遥测前端使用 React、TypeScript、Vite 和 npm 构建。当前阶段提供可运行的控制台骨架、基础导航、总览首屏、Settings 基础管理页面、健康检查 API client 和环境变量示例。

## 环境要求

- 使用 Node.js `24.13.0` LTS，`.node-version` 与 `package.json` 的 `engines.node` 均固定为 `24.13.0`；npm 使用 `11.x`。
- 使用 npm 管理依赖，提交 `package-lock.json`。
- Windows PowerShell 中建议使用 `npm.cmd`。

## 本地启动

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

开发服务默认监听 `25173`：

```text
http://localhost:25173
```

预览构建产物默认监听 `25174`：

```powershell
npm.cmd run build
npm.cmd run preview
```

## 环境变量

复制 `.env.example` 为本地 `.env.local` 后按需调整。不要提交真实 `.env*` 文件。

```text
VITE_APP_NAME=遥测平台
VITE_APP_VERSION=0.1.0
VITE_API_BASE_URL=http://localhost:28117
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=25173
VITE_PREVIEW_HOST=127.0.0.1
VITE_PREVIEW_PORT=25174
```

`VITE_API_BASE_URL` 用于 API client 的基础地址。若留空，则使用同源请求。
`VITE_DEV_HOST` 和 `VITE_PREVIEW_HOST` 默认使用 `127.0.0.1`，如需局域网调试可在本地环境变量中显式调整。

## Settings 基础管理页面

`/settings` 页面提供阶段 1 的项目、环境、服务基础管理骨架：

- 项目：调用 `GET /api/v1/projects` 和 `POST /api/v1/projects`，创建字段使用后端契约的 `name`、`key`、`description`。
- 环境：调用 `GET /api/v1/environments` 和 `POST /api/v1/environments`，创建时必须选择 `project_id`，标识字段使用 `key`。
- 服务：调用 `GET /api/v1/services` 和 `POST /api/v1/services`，创建时必须选择 `project_id` 和 `environment_id`；环境下拉会按当前项目过滤，切换项目时会清空不匹配的环境。

列表响应兼容后端当前直接数组返回，也兼容 `{ items }`、`{ data }`、`{ results }` 包装。

错误展示不要求后端服务已启动即可验证：API client 兼容 FastAPI `detail` 为字符串、校验错误数组或对象；`/settings` 列表读取错误按页面级展示，创建表单对 `404`、`409`、`422` 使用表单级提示并保留后端返回的具体原因。

## 目录结构

```text
src/
  app/          应用 Provider 和路由
  api/          API client、配置和接口封装
  components/   通用布局和展示组件
  features/     领域组件，当前包含 settings 基础管理面板
  pages/        页面入口
  styles/       全局样式
```

## 验证命令

前端使用 ESLint 作为静态代码质量检查，CI 会执行 `npm run lint`：

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

当前首屏会调用 `GET /health`。后端未启动时页面会显示“待连接”状态，这是预期的可恢复错误态。
