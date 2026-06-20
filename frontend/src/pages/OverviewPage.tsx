import { useQuery } from '@tanstack/react-query';
import { Activity, Database, RadioTower, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { appConfig } from '../api/config';
import { getHealth } from '../api/health';
import { ApiClientError } from '../api/http';
import { StatusBadge } from '../components/StatusBadge';

const signalCards = [
  { label: 'Metrics', value: '0/s', note: '等待摄入', tone: 'neutral' },
  { label: 'Logs', value: '0/s', note: '暂无写入', tone: 'neutral' },
  { label: 'Traces', value: '0', note: '未接入采样', tone: 'warning' },
  { label: 'Events', value: '0', note: '事件流待启用', tone: 'neutral' }
] as const;

const pipelineSteps = [
  'HTTP Ingestion',
  'OpenTelemetry Collector',
  'Stream Buffer',
  'Analytical Storage',
  'Query Workspace'
];

const recentEvents = [
  { time: '14:12', title: '前端骨架准备中', detail: 'React + TypeScript + Vite 工作台初始化。' },
  { time: '14:03', title: '项目计划更新', detail: '确认本地开发端口和多 agent 协作流程。' },
  { time: '13:57', title: '版本基线建立', detail: '前端版本初始化为 0.1.0。' }
];

export function OverviewPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false
  });

  const healthTone = healthQuery.data?.status === 'ok' ? 'success' : healthQuery.isError ? 'danger' : 'warning';
  const healthText = healthQuery.data?.status === 'ok' ? '后端在线' : healthQuery.isError ? '待连接' : '检查中';
  const errorMessage =
    healthQuery.error instanceof ApiClientError ? healthQuery.error.message : '后端健康检查暂不可用。';

  return (
    <div className="overview-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Telemetry Console</p>
          <h1>遥测总览</h1>
          <p className="workspace-summary">
            面向指标、日志、链路和事件的统一工作台骨架已经就绪，后续页面将围绕查询、告警和仪表盘逐步补齐。
          </p>
        </div>

        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => healthQuery.refetch()} title="刷新健康检查">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge tone={healthTone}>{healthText}</StatusBadge>
        </div>
      </header>

      <section className="status-panel" aria-label="平台状态">
        <div className="status-copy">
          <div className="status-icon">
            <RadioTower size={24} aria-hidden="true" />
          </div>
          <div>
            <h2>摄入管线</h2>
            <p>当前首屏使用静态占位数据和健康检查 API，真实遥测统计会在后端查询接口稳定后接入。</p>
          </div>
        </div>
        <div className="pipeline">
          {pipelineSteps.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </section>

      <section className="metrics-grid" aria-label="遥测信号概览">
        {signalCards.map((card) => (
          <article className="metric-tile" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <StatusBadge tone={card.tone}>{card.note}</StatusBadge>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="health-panel">
          <div className="section-heading">
            <div>
              <h2>后端健康检查</h2>
              <p>API 地址来自环境变量。</p>
            </div>
            <Server size={20} aria-hidden="true" />
          </div>

          <dl className="health-list">
            <div>
              <dt>API Base URL</dt>
              <dd>{appConfig.apiBaseUrl || '未配置，使用同源请求'}</dd>
            </div>
            <div>
              <dt>服务状态</dt>
              <dd>{healthQuery.isLoading ? '检查中' : healthQuery.data?.status || '暂无数据'}</dd>
            </div>
            <div>
              <dt>服务名称</dt>
              <dd>{healthQuery.data?.service || '-'}</dd>
            </div>
            <div>
              <dt>运行环境</dt>
              <dd>{healthQuery.data?.environment || '-'}</dd>
            </div>
          </dl>

          {healthQuery.isError ? (
            <div className="inline-alert" role="status">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </article>

        <article className="events-panel">
          <div className="section-heading">
            <div>
              <h2>近期事件</h2>
              <p>用于确认初始化阶段的关键动作。</p>
            </div>
            <Database size={20} aria-hidden="true" />
          </div>

          <ol className="event-list">
            {recentEvents.map((event) => (
              <li key={`${event.time}-${event.title}`}>
                <time>{event.time}</time>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="empty-state" aria-label="下一步模块">
        <Activity size={22} aria-hidden="true" />
        <div>
          <h2>下一批前端页面</h2>
          <p>优先补 Metrics 查询页、Logs 查询页和 Events 时间线页，并按沟通文件中的 API 契约接入真实数据。</p>
        </div>
      </section>
    </div>
  );
}
