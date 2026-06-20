import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Gauge, LogIn, RadioTower, RefreshCw, Server, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { appConfig } from '../api/config';
import { getHealth } from '../api/health';
import { ApiClientError, formatApiErrorMessage } from '../api/http';
import { listIngestStats } from '../api/ingestStats';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import { formatBytes, summarizeIngestStats, type IngestSignalSummary } from '../features/overview/ingestStatsSummary';

const signalRoutes = {
  metric: '/metrics',
  log: '/logs',
  event: '/events'
} satisfies Record<IngestSignalSummary['kind'], string>;

const pipelineSteps = [
  'HTTP Ingestion',
  'OpenTelemetry Collector',
  'Stream Buffer',
  'Analytical Storage',
  'Query Workspace'
];

const recentEvents = [
  { time: '22:49', title: '总览统计接入中', detail: '接入摄入统计 API，替换首屏静态遥测占位。' },
  { time: '22:42', title: '查询页基础集成', detail: 'Metrics、Logs、Events 查询工作台已进入 dev。' },
  { time: '22:12', title: '指标查询 API 完成', detail: '阶段 3 查询 API 已覆盖事件、日志和指标。' }
];

export function OverviewPage() {
  const auth = useAuth();
  const canLoadStats = auth.isAuthenticated && !auth.isRestoring;
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: false
  });
  const ingestStatsQuery = useQuery({
    queryKey: ['ingest-stats', 'overview'],
    queryFn: () => listIngestStats({ limit: 100 }),
    enabled: canLoadStats,
    retry: false
  });
  const signalSummaries = useMemo(() => summarizeIngestStats(ingestStatsQuery.data ?? []), [ingestStatsQuery.data]);
  const hasIngestStats = signalSummaries.some((summary) => summary.acceptedCount > 0 || summary.rejectedCount > 0);
  const totalAccepted = signalSummaries.reduce((total, summary) => total + summary.acceptedCount, 0);
  const totalRejected = signalSummaries.reduce((total, summary) => total + summary.rejectedCount, 0);

  const healthTone = healthQuery.data?.status === 'ok' ? 'success' : healthQuery.isError ? 'danger' : 'warning';
  const healthText = healthQuery.data?.status === 'ok' ? '后端在线' : healthQuery.isError ? '待连接' : '检查中';
  const statsTone = !canLoadStats ? 'warning' : ingestStatsQuery.isError ? 'danger' : hasIngestStats ? 'success' : 'neutral';
  const statsText = !canLoadStats ? (auth.isRestoring ? '恢复中' : '需要登录') : ingestStatsQuery.isError ? '统计异常' : hasIngestStats ? '有摄入' : '暂无摄入';
  const healthErrorMessage =
    healthQuery.error instanceof ApiClientError ? healthQuery.error.message : '后端健康检查暂不可用。';

  function refreshOverview() {
    void healthQuery.refetch();

    if (canLoadStats) {
      void ingestStatsQuery.refetch();
    }
  }

  return (
    <div className="overview-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Telemetry Console</p>
          <h1>遥测总览</h1>
          <p className="workspace-summary">
            当前总览汇总后端健康状态和最近摄入统计，帮助确认数据是否持续进入查询工作台。
          </p>
        </div>

        <div className="header-actions">
          <button className="icon-button" type="button" onClick={refreshOverview} title="刷新总览数据">
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
            <p>{`最近统计覆盖当前账号可访问项目的 metrics、logs 和 events。已接收 ${formatCompactNumber(totalAccepted)} 条，拒绝 ${formatCompactNumber(totalRejected)} 条。`}</p>
          </div>
        </div>
        <div className="pipeline">
          {pipelineSteps.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </section>

      <section className="metrics-grid" aria-label="遥测信号概览">
        {signalSummaries.map((summary) => (
          <Link className="metric-tile metric-tile--link" key={summary.kind} to={signalRoutes[summary.kind]}>
            <span>{summary.label}</span>
            <strong>{canLoadStats ? formatCompactNumber(summary.acceptedCount) : '-'}</strong>
            <small>{buildSignalMeta(summary, canLoadStats, ingestStatsQuery.isFetching)}</small>
            <StatusBadge tone={getSignalTone(summary, canLoadStats, ingestStatsQuery.isFetching)}>
              {buildSignalBadge(summary, canLoadStats, ingestStatsQuery.isFetching)}
            </StatusBadge>
          </Link>
        ))}
        <article className="metric-tile">
          <span>Traces</span>
          <strong>-</strong>
          <small>trace ingestion 后接入</small>
          <StatusBadge tone="warning">待接入</StatusBadge>
        </article>
      </section>

      <section className="content-grid">
        <article className="ingest-stats-panel">
          <div className="section-heading">
            <div>
              <h2>摄入统计</h2>
              <p>按最近统计桶汇总 accepted、rejected 和 payload 字节数。</p>
            </div>
            <StatusBadge tone={statsTone}>{statsText}</StatusBadge>
          </div>

          {!canLoadStats ? (
            <div className="settings-auth-notice" aria-live="polite">
              <ShieldAlert size={20} aria-hidden="true" />
              <div>
                <strong>{auth.isRestoring ? '正在恢复登录状态' : '登录后查看摄入统计'}</strong>
                <p>{auth.isRestoring ? '会话恢复完成后会自动读取统计。' : '摄入统计接口需要当前账号访问令牌。'}</p>
              </div>
              {!auth.isRestoring ? (
                <Link className="text-button" to="/login">
                  <LogIn size={16} aria-hidden="true" />
                  <span>登录</span>
                </Link>
              ) : null}
            </div>
          ) : null}

          {canLoadStats && ingestStatsQuery.isError ? (
            <div className="inline-alert" role="status">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>{formatApiErrorMessage(ingestStatsQuery.error)}</span>
            </div>
          ) : null}

          {canLoadStats && !ingestStatsQuery.isError && !hasIngestStats ? (
            <div className="resource-state">
              <Gauge size={18} aria-hidden="true" />
              <div>
                <strong>{ingestStatsQuery.isFetching ? '正在读取统计' : '暂无摄入统计'}</strong>
                <span>完成数据上报后，这里会显示 metrics、logs 和 events 的最近统计。</span>
              </div>
            </div>
          ) : null}

          {canLoadStats && !ingestStatsQuery.isError && hasIngestStats ? (
            <ol className="ingest-stats-list">
              {signalSummaries.map((summary) => (
                <li key={summary.kind}>
                  <div>
                    <strong>{summary.label}</strong>
                    <span>{summary.sourceCount > 0 ? `${summary.sourceCount} 个来源` : '未标记来源'}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>accepted</dt>
                      <dd>{formatCompactNumber(summary.acceptedCount)}</dd>
                    </div>
                    <div>
                      <dt>rejected</dt>
                      <dd>{formatCompactNumber(summary.rejectedCount)}</dd>
                    </div>
                    <div>
                      <dt>bytes</dt>
                      <dd>{formatBytes(summary.bytesCount)}</dd>
                    </div>
                    <div>
                      <dt>latest</dt>
                      <dd>{formatLatestTime(summary.latestBucketStart)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : null}
        </article>

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
              <span>{healthErrorMessage}</span>
            </div>
          ) : null}
        </article>

        <article className="events-panel">
          <div className="section-heading">
            <div>
              <h2>近期进展</h2>
              <p>用于确认阶段 3 的关键动作。</p>
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
          <h2>下一批查询增强</h2>
          <p>继续补登录后真实查询联调、基础图表、日志上下文和查询结果分页。</p>
        </div>
      </section>
    </div>
  );
}

function buildSignalMeta(summary: IngestSignalSummary, canLoadStats: boolean, isFetching: boolean) {
  if (!canLoadStats) {
    return '登录后读取统计';
  }

  if (isFetching && summary.acceptedCount === 0 && summary.rejectedCount === 0) {
    return '读取中';
  }

  if (summary.acceptedCount === 0 && summary.rejectedCount === 0) {
    return '暂无最近统计';
  }

  return `${formatBytes(summary.bytesCount)} / ${summary.sourceCount || 0} 个来源`;
}

function buildSignalBadge(summary: IngestSignalSummary, canLoadStats: boolean, isFetching: boolean) {
  if (!canLoadStats) {
    return '需要登录';
  }

  if (isFetching && summary.acceptedCount === 0 && summary.rejectedCount === 0) {
    return '读取中';
  }

  if (summary.rejectedCount > 0) {
    return `拒绝 ${formatCompactNumber(summary.rejectedCount)}`;
  }

  return summary.acceptedCount > 0 ? '正常接收' : '暂无统计';
}

function getSignalTone(summary: IngestSignalSummary, canLoadStats: boolean, isFetching: boolean) {
  if (!canLoadStats || isFetching) {
    return 'warning';
  }

  if (summary.rejectedCount > 0) {
    return 'danger';
  }

  return summary.acceptedCount > 0 ? 'success' : 'neutral';
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function formatLatestTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
