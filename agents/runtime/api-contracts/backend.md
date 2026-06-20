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
