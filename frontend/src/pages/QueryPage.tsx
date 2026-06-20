import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, LogIn, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  listEvents,
  listLogs,
  listMetrics,
  type EventQueryItem,
  type EventQueryParams,
  type LogQueryItem,
  type LogQueryParams,
  type MetricQueryItem,
  type MetricQueryParams
} from '../api/query';
import { formatApiErrorMessage } from '../api/http';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';

type QuerySignal = 'metrics' | 'logs' | 'events';

type QueryFilters = {
  projectId: string;
  primary: string;
  source: string;
  occurredFrom: string;
  occurredTo: string;
  limit: string;
};

type QueryRecord = MetricQueryItem | LogQueryItem | EventQueryItem;

type QueryPageProps = {
  signal: QuerySignal;
};

const signalConfig = {
  metrics: {
    eyebrow: 'Metrics',
    title: '指标查询',
    summary: '读取当前账号可访问项目的指标样本。',
    primaryLabel: '指标名',
    primaryPlaceholder: 'http.requests',
    icon: BarChart3,
    queryKey: 'metrics',
    fetch: (params: MetricQueryParams) => listMetrics(params)
  },
  logs: {
    eyebrow: 'Logs',
    title: '日志检索',
    summary: '按级别、来源和时间范围检索日志记录。',
    primaryLabel: '日志级别',
    primaryPlaceholder: 'error',
    icon: Search,
    queryKey: 'logs',
    fetch: (params: LogQueryParams) => listLogs(params)
  },
  events: {
    eyebrow: 'Events',
    title: '事件时间线',
    summary: '按事件类型、来源和时间范围查看离散事件。',
    primaryLabel: '事件类型',
    primaryPlaceholder: 'deploy.started',
    icon: Boxes,
    queryKey: 'events',
    fetch: (params: EventQueryParams) => listEvents(params)
  }
} satisfies Record<QuerySignal, unknown>;

const defaultFilters: QueryFilters = {
  projectId: '',
  primary: '',
  source: '',
  occurredFrom: '',
  occurredTo: '',
  limit: '100'
};

export function QueryPage({ signal }: QueryPageProps) {
  const auth = useAuth();
  const location = useLocation();
  const config = signalConfig[signal];
  const [filters, setFilters] = useState<QueryFilters>(defaultFilters);
  const [submittedFilters, setSubmittedFilters] = useState<QueryFilters>(defaultFilters);
  const canQuery = auth.isAuthenticated && !auth.isRestoring;
  const params = useMemo(() => buildQueryParams(signal, submittedFilters), [signal, submittedFilters]);
  const query = useQuery({
    queryKey: ['query', signal, params],
    queryFn: () => config.fetch(params as never) as Promise<QueryRecord[]>,
    enabled: canQuery,
    retry: false
  });
  const Icon = config.icon;
  const badgeTone = !canQuery ? 'warning' : query.isError ? 'danger' : query.isFetching ? 'warning' : 'success';
  const badgeLabel = !canQuery ? (auth.isRestoring ? '恢复中' : '需要登录') : query.isFetching ? '查询中' : query.isError ? '查询异常' : '已就绪';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedFilters(filters);
  }

  return (
    <div className="query-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p className="workspace-summary">{config.summary}</p>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => query.refetch()}
            disabled={!canQuery}
            title={canQuery ? '刷新查询结果' : '登录后刷新查询结果'}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
        </div>
      </header>

      {!canQuery ? (
        <section className="settings-auth-notice" aria-live="polite">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{auth.isRestoring ? '正在恢复登录状态' : '登录后查询遥测数据'}</strong>
            <p>{auth.isRestoring ? '会话恢复完成后会自动发起查询。' : '查询接口需要使用当前账号的访问令牌。'}</p>
          </div>
          {!auth.isRestoring ? (
            <Link className="text-button" to="/login" state={{ from: { pathname: location.pathname } }}>
              <LogIn size={16} aria-hidden="true" />
              <span>登录</span>
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="query-toolbar" aria-label="查询筛选">
        <div className="section-heading">
          <div>
            <h2>筛选条件</h2>
            <p>默认查询当前账号可访问的全部项目。</p>
          </div>
          <Icon size={20} aria-hidden="true" />
        </div>

        <form className="query-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>项目 ID</span>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={filters.projectId}
              onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}
              placeholder="全部项目"
            />
          </label>
          <label className="field">
            <span>{config.primaryLabel}</span>
            <input
              value={filters.primary}
              onChange={(event) => setFilters({ ...filters, primary: event.target.value })}
              placeholder={config.primaryPlaceholder}
            />
          </label>
          <label className="field">
            <span>来源</span>
            <input
              value={filters.source}
              onChange={(event) => setFilters({ ...filters, source: event.target.value })}
              placeholder="api"
            />
          </label>
          <label className="field">
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={filters.occurredFrom}
              onChange={(event) => setFilters({ ...filters, occurredFrom: event.target.value })}
            />
          </label>
          <label className="field">
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={filters.occurredTo}
              onChange={(event) => setFilters({ ...filters, occurredTo: event.target.value })}
            />
          </label>
          <label className="field">
            <span>数量</span>
            <input
              type="number"
              min="1"
              max="500"
              inputMode="numeric"
              value={filters.limit}
              onChange={(event) => setFilters({ ...filters, limit: event.target.value })}
            />
          </label>
          <button className="primary-button query-submit" type="submit" disabled={!canQuery || query.isFetching}>
            <Search size={16} aria-hidden="true" />
            <span>{query.isFetching ? '查询中' : '查询'}</span>
          </button>
        </form>
      </section>

      <section className="query-results" aria-label="查询结果">
        <div className="section-heading">
          <div>
            <h2>结果列表</h2>
            <p>{query.data ? `${query.data.length} 条记录` : '等待查询结果'}</p>
          </div>
          <StatusBadge tone={query.data && query.data.length > 0 ? 'success' : 'neutral'}>
            {query.data && query.data.length > 0 ? '有数据' : '暂无数据'}
          </StatusBadge>
        </div>

        {query.isError ? (
          <div className="resource-state resource-state--error" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>查询失败</strong>
              <span>{formatApiErrorMessage(query.error)}</span>
            </div>
          </div>
        ) : null}

        {!query.isError && query.data?.length === 0 ? (
          <div className="resource-state">
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong>暂无匹配记录</strong>
              <span>调整项目、来源或时间范围后重试。</span>
            </div>
          </div>
        ) : null}

        {!query.isError && query.data && query.data.length > 0 ? (
          <ol className="query-list">
            {query.data.map((item) => (
              <li key={`${signal}-${item.id}`}>{renderRecord(signal, item)}</li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

function buildQueryParams(signal: QuerySignal, filters: QueryFilters) {
  const common = {
    project_id: toNumber(filters.projectId),
    source: toOptional(filters.source),
    occurred_from: toOptional(filters.occurredFrom),
    occurred_to: toOptional(filters.occurredTo),
    limit: toNumber(filters.limit)
  };

  if (signal === 'metrics') {
    return { ...common, name: toOptional(filters.primary) };
  }

  if (signal === 'logs') {
    return { ...common, level: toOptional(filters.primary) };
  }

  return { ...common, type: toOptional(filters.primary) };
}

function renderRecord(signal: QuerySignal, item: QueryRecord) {
  if (signal === 'metrics') {
    const metric = item as MetricQueryItem;
    return (
      <>
        <div className="query-record-main">
          <strong>{metric.name}</strong>
          <span>{formatNumber(metric.value, metric.unit)}</span>
        </div>
        <RecordMeta item={metric} extra={[metric.type, metric.source]} />
        <JsonPreview label="tags" value={metric.tags} />
        <JsonPreview label="payload" value={metric.payload} />
      </>
    );
  }

  if (signal === 'logs') {
    const log = item as LogQueryItem;
    return (
      <>
        <div className="query-record-main">
          <strong>{log.message}</strong>
          <StatusBadge tone={log.level.toLowerCase().includes('error') ? 'danger' : 'neutral'}>{log.level}</StatusBadge>
        </div>
        <RecordMeta item={log} extra={[log.source, log.logger, log.trace_id]} />
        <JsonPreview label="attributes" value={log.attributes} />
        <JsonPreview label="payload" value={log.payload} />
      </>
    );
  }

  const event = item as EventQueryItem;
  return (
    <>
      <div className="query-record-main">
        <strong>{event.type}</strong>
        <span>{event.source || '未标记来源'}</span>
      </div>
      <RecordMeta item={event} extra={[event.source]} />
      <JsonPreview label="payload" value={event.payload} />
    </>
  );
}

function RecordMeta({ item, extra }: { item: QueryRecord; extra: Array<string | null | undefined> }) {
  const parts = [`#${item.id}`, `project ${item.project_id}`, formatTime(item.occurred_at ?? item.received_at), ...extra]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, array) => array.indexOf(part) === index);
  return <p className="query-record-meta">{parts.join(' / ')}</p>;
}

function JsonPreview({ label, value }: { label: string; value: Record<string, unknown> }) {
  if (Object.keys(value).length === 0) {
    return null;
  }

  return (
    <pre className="query-json">
      <span>{label}</span>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function toOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatTime(value: string) {
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

function formatNumber(value: number, unit: string | null) {
  return `${Number.isInteger(value) ? value : value.toFixed(3)}${unit ? ` ${unit}` : ''}`;
}
