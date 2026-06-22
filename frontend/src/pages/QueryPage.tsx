import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GitBranch,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Search,
  ShieldAlert
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  listEvents,
  getLogContext,
  listMetricAggregates,
  listLogs,
  listMetrics,
  listTraces,
  normalizeLogContextWindow,
  DEFAULT_LOG_CONTEXT_WINDOW,
  MAX_LOG_CONTEXT_WINDOW,
  type EventQueryItem,
  type EventQueryParams,
  type LogQueryItem,
  type LogQueryParams,
  type MetricAggregateItem,
  type MetricQueryItem,
  type MetricQueryParams,
  type QueryResultPage,
  type TraceQueryItem,
  type TraceQueryParams
} from '../api/query';
import { formatApiErrorMessage } from '../api/http';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import { buildMetricTrendModel, metricTrendViewBox, type MetricTrendModel } from '../features/metrics/metricTrend';
import { summarizeEventPayload } from '../features/query/eventTimeline';
import {
  buildMetricAggregateParams,
  buildQueryParams,
  defaultFilters,
  metricAggregationOptions,
  metricWindowOptions,
  type QueryFilters,
  type QuerySignal
} from '../features/query/queryFilters';
import {
  buildLogContextQueryKey,
  buildSignalQueryKey,
  resolveVisibleQueryData,
  shouldRenderLogContextPanel
} from '../features/query/querySession';

type QueryRecord = MetricQueryItem | LogQueryItem | TraceQueryItem | EventQueryItem;

const emptyRecords: QueryRecord[] = [];

type QueryPageProps = {
  signal: QuerySignal;
};

type SignalScopedFilters = {
  signal: QuerySignal;
  filters: QueryFilters;
};

type PaginationState = {
  signal: QuerySignal;
  cursor?: string;
  page: number;
  version: number;
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
  traces: {
    eyebrow: 'Traces',
    title: '链路查询',
    summary: '按 trace、span、名称、来源和时间范围检索 span 记录。',
    primaryLabel: 'Span 名称',
    primaryPlaceholder: 'GET /api/orders',
    icon: GitBranch,
    queryKey: 'traces',
    fetch: (params: TraceQueryParams) => listTraces(params)
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

export function QueryPage({ signal }: QueryPageProps) {
  const auth = useAuth();
  const location = useLocation();
  const config = signalConfig[signal];
  const [draftFilters, setDraftFilters] = useState<SignalScopedFilters>({ signal, filters: defaultFilters });
  const [submittedFilters, setSubmittedFilters] = useState<SignalScopedFilters>({ signal, filters: defaultFilters });
  const [pagination, setPagination] = useState<PaginationState>({ signal, page: 1, version: 0 });
  const canQuery = auth.isAuthenticated && !auth.isRestoring;
  const filters = draftFilters.signal === signal ? draftFilters.filters : defaultFilters;
  const activeSubmittedFilters = submittedFilters.signal === signal ? submittedFilters.filters : defaultFilters;
  const pageCursor = pagination.signal === signal ? pagination.cursor : undefined;
  const pageNumber = pagination.signal === signal ? pagination.page : 1;
  const params = useMemo(
    () => buildQueryParams(signal, activeSubmittedFilters, pageCursor),
    [signal, activeSubmittedFilters, pageCursor]
  );
  const aggregateParams = useMemo(
    () => (signal === 'metrics' ? buildMetricAggregateParams(activeSubmittedFilters) : null),
    [signal, activeSubmittedFilters]
  );
  const query = useQuery({
    queryKey: buildSignalQueryKey(auth.sessionRevision, signal, params, pagination.version),
    queryFn: () => config.fetch(params as never) as Promise<QueryResultPage<QueryRecord>>,
    enabled: canQuery,
    retry: false
  });
  const aggregateQuery = useQuery({
    queryKey: buildSignalQueryKey(auth.sessionRevision, 'metrics-aggregate', aggregateParams, pagination.version),
    queryFn: () => listMetricAggregates(aggregateParams ?? undefined),
    enabled: canQuery && signal === 'metrics' && aggregateParams !== null,
    retry: false
  });
  const Icon = config.icon;
  const visibleData = resolveVisibleQueryData(canQuery, query.data);
  const aggregateData = resolveVisibleQueryData(canQuery && signal === 'metrics', aggregateQuery.data);
  const records = visibleData?.items ?? emptyRecords;
  const nextCursor = visibleData?.next_cursor ?? null;
  const hasRecords = records.length > 0;
  const hasQueryError = canQuery && query.isError;
  const hasAggregateError = canQuery && signal === 'metrics' && aggregateQuery.isError;
  const metricTrend = signal === 'metrics' ? buildMetricTrendModel(records as MetricQueryItem[]) : null;
  const isFetching = query.isFetching || (signal === 'metrics' && aggregateQuery.isFetching);
  const isInitialLoading = canQuery && query.isFetching && !visibleData && !hasQueryError;
  const badgeTone = !canQuery ? 'warning' : query.isError || aggregateQuery.isError ? 'danger' : isFetching ? 'warning' : 'success';
  const badgeLabel = !canQuery
    ? auth.isRestoring
      ? '恢复中'
      : '需要登录'
    : isFetching
      ? '查询中'
      : query.isError || aggregateQuery.isError
        ? '查询异常'
        : '已就绪';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedFilters({ signal, filters });
    resetPagination();
  }

  function handleRefresh() {
    if (!canQuery) {
      return;
    }

    resetPagination();
  }

  function handleNextPage() {
    if (!nextCursor || query.isFetching) {
      return;
    }

    setPagination((current) => ({
      signal,
      cursor: nextCursor,
      page: current.signal === signal ? current.page + 1 : 2,
      version: current.version
    }));
  }

  function handleFirstPage() {
    if (pageNumber === 1 || query.isFetching) {
      return;
    }

    resetPagination();
  }

  function updateFilter<TName extends keyof QueryFilters>(name: TName, value: QueryFilters[TName]) {
    setDraftFilters({
      signal,
      filters: {
        ...filters,
        [name]: value
      }
    });
  }

  function resetPagination() {
    setPagination((current) => ({
      signal,
      cursor: undefined,
      page: 1,
      version: current.version + 1
    }));
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
            onClick={handleRefresh}
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
              onChange={(event) => updateFilter('projectId', event.target.value)}
              placeholder="全部项目"
            />
          </label>
          <label className="field">
            <span>{config.primaryLabel}</span>
            <input
              value={filters.primary}
              onChange={(event) => updateFilter('primary', event.target.value)}
              placeholder={config.primaryPlaceholder}
            />
          </label>
          {signal === 'logs' ? (
            <>
              <label className="field">
                <span>关键词</span>
                <input
                  value={filters.keyword}
                  onChange={(event) => updateFilter('keyword', event.target.value)}
                  placeholder="message"
                />
              </label>
              <label className="field">
                <span>Trace ID</span>
                <input
                  value={filters.traceId}
                  onChange={(event) => updateFilter('traceId', event.target.value)}
                  placeholder="trace-123"
                />
              </label>
              <label className="field">
                <span>Span ID</span>
                <input
                  value={filters.spanId}
                  onChange={(event) => updateFilter('spanId', event.target.value)}
                  placeholder="span-456"
                />
              </label>
            </>
          ) : null}
          {signal === 'traces' ? (
            <>
              <label className="field">
                <span>Trace ID</span>
                <input
                  value={filters.traceId}
                  onChange={(event) => updateFilter('traceId', event.target.value)}
                  placeholder="trace-123"
                />
              </label>
              <label className="field">
                <span>Span ID</span>
                <input
                  value={filters.spanId}
                  onChange={(event) => updateFilter('spanId', event.target.value)}
                  placeholder="span-456"
                />
              </label>
            </>
          ) : null}
          {signal === 'logs' ? (
            <>
              <label className="field">
                <span>Request ID</span>
                <input
                  value={filters.requestId}
                  onChange={(event) => updateFilter('requestId', event.target.value)}
                  placeholder="req-789"
                />
              </label>
              <label className="field">
                <span>User ID</span>
                <input
                  value={filters.userId}
                  onChange={(event) => updateFilter('userId', event.target.value)}
                  placeholder="user-123"
                />
              </label>
            </>
          ) : null}
          <label className="field">
            <span>来源</span>
            <input
              value={filters.source}
              onChange={(event) => updateFilter('source', event.target.value)}
              placeholder="api"
            />
          </label>
          <label className="field">
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={filters.occurredFrom}
              onChange={(event) => updateFilter('occurredFrom', event.target.value)}
            />
          </label>
          <label className="field">
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={filters.occurredTo}
              onChange={(event) => updateFilter('occurredTo', event.target.value)}
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
              onChange={(event) => updateFilter('limit', event.target.value)}
            />
          </label>
          {signal === 'metrics' ? (
            <>
              <label className="field">
                <span>窗口</span>
                <select
                  value={filters.metricWindow}
                  onChange={(event) => updateFilter('metricWindow', event.target.value as QueryFilters['metricWindow'])}
                >
                  {metricWindowOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatMetricWindowLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>聚合方式</span>
                <select
                  value={filters.metricAggregation}
                  onChange={(event) =>
                    updateFilter('metricAggregation', event.target.value as QueryFilters['metricAggregation'])
                  }
                >
                  {metricAggregationOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatMetricAggregationLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <button className="primary-button query-submit" type="submit" disabled={!canQuery || isFetching}>
            <Search size={16} aria-hidden="true" />
            <span>{isFetching ? '查询中' : '查询'}</span>
          </button>
        </form>
      </section>

      <section className="query-results" aria-label="查询结果">
        <div className="section-heading">
          <div>
            <h2>{signal === 'events' ? '事件时间线' : '结果列表'}</h2>
            <p>{visibleData ? formatResultSummary(pageNumber, records.length) : '等待查询结果'}</p>
          </div>
          <StatusBadge tone={hasRecords ? 'success' : 'neutral'}>
            {hasRecords ? '有数据' : '暂无数据'}
          </StatusBadge>
        </div>

        {hasQueryError ? (
          <div className="resource-state resource-state--error" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>查询失败</strong>
              <span>{formatApiErrorMessage(query.error)}</span>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <div className="resource-state query-loading-state" role="status">
            <LoaderCircle size={18} aria-hidden="true" />
            <div>
              <strong>正在加载查询结果</strong>
              <span>按当前筛选读取第一页记录。</span>
            </div>
          </div>
        ) : null}

        {!hasQueryError && visibleData && records.length === 0 ? (
          <div className="resource-state">
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong>暂无匹配记录</strong>
              <span>调整项目、来源或时间范围后重试。</span>
            </div>
          </div>
        ) : null}

        {!hasQueryError && hasRecords && signal === 'metrics' ? <MetricTrend trend={metricTrend} /> : null}

        {signal === 'metrics' && canQuery ? (
          <MetricAggregatePanel
            items={aggregateData?.items ?? []}
            isLoading={aggregateQuery.isFetching && !aggregateData}
            isError={hasAggregateError}
            error={aggregateQuery.error}
            windowLabel={formatMetricWindowLabel(activeSubmittedFilters.metricWindow)}
            aggregationLabel={formatMetricAggregationLabel(activeSubmittedFilters.metricAggregation)}
          />
        ) : null}

        {!hasQueryError && hasRecords && signal === 'events' ? (
          <EventTimeline events={records as EventQueryItem[]} />
        ) : null}

        {!hasQueryError && hasRecords && signal !== 'events' ? (
          <ol className="query-list">
            {records.map((item) => (
              <li key={`${signal}-${item.id}`}>{renderRecord(signal, item, canQuery, auth.sessionRevision)}</li>
            ))}
          </ol>
        ) : null}

        {!hasQueryError && visibleData ? (
          <div className="query-pagination" aria-label="分页">
            <span>{formatPaginationHint(pageNumber, records.length, nextCursor)}</span>
            <div className="query-pagination-actions">
              <button
                className="text-button"
                type="button"
                onClick={handleFirstPage}
                disabled={!canQuery || query.isFetching || pageNumber === 1}
              >
                <span>回第一页</span>
              </button>
              <button
                className="text-button query-next-button"
                type="button"
                onClick={handleNextPage}
                disabled={!canQuery || query.isFetching || !nextCursor}
              >
                <span>下一页</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EventTimeline({ events }: { events: EventQueryItem[] }) {
  return (
    <ol className="event-timeline" aria-label="事件时间线">
      {events.map((event) => (
        <li key={`event-${event.id}`} className="event-timeline-item">
          <div className="event-timeline-marker" aria-hidden="true">
            <span />
          </div>
          <article className="event-timeline-body" aria-label={`事件 ${event.type}`}>
            <div className="event-timeline-main">
              <div>
                <strong>{event.type}</strong>
                <span>{event.source || '未标记来源'}</span>
              </div>
              <StatusBadge tone="neutral">{`#${event.id}`}</StatusBadge>
            </div>

            <dl className="event-timeline-meta">
              <div>
                <dt>Occurred</dt>
                <dd>
                  <time dateTime={event.occurred_at ?? event.received_at}>
                    {formatTime(event.occurred_at ?? event.received_at)}
                  </time>
                  {!event.occurred_at ? <span>使用 received</span> : null}
                </dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>
                  <time dateTime={event.received_at}>{formatTime(event.received_at)}</time>
                </dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{event.project_id}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{event.source || '未标记来源'}</dd>
              </div>
            </dl>

            <details className="event-payload-preview">
              <summary>
                <span>payload 摘要</span>
                <strong>{summarizeEventPayload(event.payload)}</strong>
              </summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          </article>
        </li>
      ))}
    </ol>
  );
}

function LogRecord({
  log,
  canQuery,
  sessionRevision
}: {
  log: LogQueryItem;
  canQuery: boolean;
  sessionRevision: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [before, setBefore] = useState(DEFAULT_LOG_CONTEXT_WINDOW);
  const [after, setAfter] = useState(DEFAULT_LOG_CONTEXT_WINDOW);
  const showContextPanel = shouldRenderLogContextPanel(canQuery, isExpanded);
  const contextQuery = useQuery({
    queryKey: buildLogContextQueryKey(sessionRevision, log.id, before, after),
    queryFn: () => getLogContext(log.id, { before, after }),
    enabled: showContextPanel,
    retry: false
  });
  const context = resolveVisibleQueryData(canQuery, contextQuery.data);
  const hasContext =
    Boolean(context?.target) || (context?.before.length ?? 0) > 0 || (context?.after.length ?? 0) > 0;

  function updateWindow(kind: 'before' | 'after', value: string) {
    const normalized = normalizeLogContextWindow(Number(value));

    if (kind === 'before') {
      setBefore(normalized);
      return;
    }

    setAfter(normalized);
  }

  return (
    <>
      <div className="query-record-main">
        <strong>{log.message}</strong>
        <div className="query-record-actions">
          <StatusBadge tone={getLogLevelTone(log.level)}>{log.level}</StatusBadge>
          <button
            className="text-button log-context-toggle"
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            disabled={!canQuery}
            aria-expanded={showContextPanel}
            title={canQuery ? '查看日志上下文' : '登录后查看日志上下文'}
          >
            <Eye size={15} aria-hidden="true" />
            <span>查看上下文</span>
            {isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <RecordMeta item={log} extra={[log.source, log.logger, log.trace_id]} />
      <JsonPreview label="attributes" value={log.attributes} />
      <JsonPreview label="payload" value={log.payload} />

      {showContextPanel ? (
        <div className="log-context-panel" aria-label={`日志 #${log.id} 上下文`}>
          <div className="log-context-toolbar">
            <div>
              <strong>日志上下文</strong>
              <span>围绕目标日志展示相邻记录。</span>
            </div>
            <div className="log-context-controls">
              <label>
                <span>前</span>
                <input
                  type="number"
                  min="0"
                  max={MAX_LOG_CONTEXT_WINDOW}
                  inputMode="numeric"
                  value={before}
                  onChange={(event) => updateWindow('before', event.target.value)}
                />
              </label>
              <label>
                <span>后</span>
                <input
                  type="number"
                  min="0"
                  max={MAX_LOG_CONTEXT_WINDOW}
                  inputMode="numeric"
                  value={after}
                  onChange={(event) => updateWindow('after', event.target.value)}
                />
              </label>
              <button
                className="icon-button log-context-refresh"
                type="button"
                onClick={() => void contextQuery.refetch()}
                disabled={!canQuery || contextQuery.isFetching}
                title="刷新日志上下文"
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {contextQuery.isFetching && !context ? (
            <div className="resource-state log-context-state" role="status">
              <LoaderCircle size={18} aria-hidden="true" />
              <div>
                <strong>正在加载上下文</strong>
                <span>读取目标日志前后 {before + after} 条记录。</span>
              </div>
            </div>
          ) : null}

          {contextQuery.isError ? (
            <div className="resource-state resource-state--error log-context-state" role="status">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <strong>上下文加载失败</strong>
                <span>{formatApiErrorMessage(contextQuery.error)}</span>
              </div>
            </div>
          ) : null}

          {!contextQuery.isError && context && !hasContext ? (
            <div className="resource-state log-context-state">
              <Search size={18} aria-hidden="true" />
              <div>
                <strong>暂无上下文</strong>
                <span>后端未返回目标日志或邻近日志。</span>
              </div>
            </div>
          ) : null}

          {!contextQuery.isError && context && hasContext ? (
            <div className="log-context-groups" aria-busy={contextQuery.isFetching}>
              <LogContextGroup title="Before" logs={context.before} emptyText="目标日志之前暂无记录。" />
              <LogContextGroup
                title="Target"
                logs={context.target ? [context.target] : []}
                emptyText="目标日志未返回。"
                isTarget
              />
              <LogContextGroup title="After" logs={context.after} emptyText="目标日志之后暂无记录。" />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function LogContextGroup({
  title,
  logs,
  emptyText,
  isTarget = false
}: {
  title: string;
  logs: LogQueryItem[];
  emptyText: string;
  isTarget?: boolean;
}) {
  return (
    <section className={`log-context-group${isTarget ? ' log-context-group--target' : ''}`}>
      <div className="log-context-group-heading">
        <strong>{title}</strong>
        <span>{logs.length} 条</span>
      </div>
      {logs.length > 0 ? (
        <ol className="log-context-list">
          {logs.map((item) => (
            <li key={`log-context-${title}-${item.id}`}>
              <div className="log-context-line-main">
                <strong>{item.message}</strong>
                <StatusBadge tone={getLogLevelTone(item.level)}>{item.level}</StatusBadge>
              </div>
              <p className="query-record-meta">{formatLogMeta(item)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="log-context-empty">{emptyText}</p>
      )}
    </section>
  );
}

function TraceRecord({ span, canQuery }: { span: TraceQueryItem; canQuery: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedLabel = isExpanded ? '收起详情' : '展开详情';

  return (
    <>
      <div className="query-record-main">
        <strong>{span.name}</strong>
        <div className="query-record-actions">
          <StatusBadge tone={getTraceStatusTone(span.status_code)}>{formatTraceStatus(span.status_code)}</StatusBadge>
          <span>{formatDuration(span.duration_ms)}</span>
          <button
            className="text-button log-context-toggle"
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            disabled={!canQuery}
            aria-expanded={isExpanded}
            title={canQuery ? '查看 span 详情' : '登录后查看 span 详情'}
          >
            <Eye size={15} aria-hidden="true" />
            <span>{expandedLabel}</span>
            {isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <RecordMeta item={span} extra={[span.source, span.trace_id, span.span_id]} />

      {isExpanded ? (
        <div className="trace-detail-panel" aria-label={`Span ${span.span_id} 详情`}>
          <dl className="trace-detail-grid">
            <TraceDetailItem label="Trace ID" value={span.trace_id} />
            <TraceDetailItem label="Span ID" value={span.span_id} />
            <TraceDetailItem label="Parent Span" value={span.parent_span_id || 'root'} />
            <TraceDetailItem label="Name" value={span.name} />
            <TraceDetailItem label="Source" value={span.source || '未标记来源'} />
            <TraceDetailItem label="Status" value={formatTraceStatus(span.status_code)} />
            <TraceDetailItem label="Duration" value={formatDuration(span.duration_ms)} />
            <TraceDetailItem label="Start" value={span.start_time ? formatTime(span.start_time) : '未提供'} />
            <TraceDetailItem label="End" value={span.end_time ? formatTime(span.end_time) : '未提供'} />
            <TraceDetailItem label="Occurred" value={formatTime(span.occurred_at ?? span.received_at)} />
            <TraceDetailItem label="Received" value={formatTime(span.received_at)} />
            <TraceDetailItem label="Project" value={`${span.project_id}`} />
          </dl>
          <JsonPreview label="attributes" value={span.attributes} />
          <JsonPreview label="payload" value={span.payload} />
        </div>
      ) : null}
    </>
  );
}

function TraceDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MetricTrend({ trend }: { trend: MetricTrendModel | null }) {
  if (!trend || trend.status === 'unavailable') {
    return (
      <div className="metric-trend metric-trend--empty">
        <Activity size={18} aria-hidden="true" />
        <div>
          <strong>当前页趋势不可用</strong>
          <span>
            {trend?.reason === 'mixed-series'
              ? '当前页包含多个指标或单位，趋势图暂不可用。'
              : '当前页没有可绘制的 received_at 与 value。'}
          </span>
        </div>
      </div>
    );
  }

  const hasLine = trend.points.length > 1;

  return (
    <div className="metric-trend" aria-label={`${trend.seriesName} 当前页 value 趋势`}>
      <div className="metric-trend-heading">
        <div>
          <span>当前页趋势</span>
          <strong>{formatNumber(trend.lastPoint.value, trend.lastPoint.unit)}</strong>
        </div>
        <dl>
          <div>
            <dt>最小</dt>
            <dd>{formatNumber(trend.minValue, trend.seriesUnit)}</dd>
          </div>
          <div>
            <dt>最大</dt>
            <dd>{formatNumber(trend.maxValue, trend.seriesUnit)}</dd>
          </div>
        </dl>
      </div>

      <svg className="metric-trend-chart" viewBox={metricTrendViewBox} role="img" aria-label="当前页指标数值随接收时间变化">
        <defs>
          <linearGradient id="metric-trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line className="metric-trend-axis" x1="18" x2="622" y1="146" y2="146" />
        {trend.areaPath ? <path className="metric-trend-area" d={trend.areaPath} /> : null}
        {hasLine ? <path className="metric-trend-line" d={trend.linePath} /> : null}
        {trend.points.map((point) => (
          <circle key={point.id} className="metric-trend-point" cx={point.x} cy={point.y} r={hasLine ? 3.6 : 4.8}>
            <title>
              {point.name} / {formatNumber(point.value, point.unit)} / {formatTime(point.receivedAt)}
            </title>
          </circle>
        ))}
      </svg>

      <div className="metric-trend-footer">
        <span>{formatTime(trend.firstPoint.receivedAt)}</span>
        <span>{formatTime(trend.lastPoint.receivedAt)}</span>
      </div>
    </div>
  );
}

function MetricAggregatePanel({
  items,
  isLoading,
  isError,
  error,
  windowLabel,
  aggregationLabel
}: {
  items: MetricAggregateItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  windowLabel: string;
  aggregationLabel: string;
}) {
  const maxMagnitude = Math.max(...items.map((item) => Math.abs(item.value)), 0);

  return (
    <div className="metric-aggregate" aria-label="指标聚合窗口结果" aria-busy={isLoading}>
      <div className="metric-aggregate-heading">
        <div>
          <span>聚合窗口</span>
          <strong>{`${windowLabel} / ${aggregationLabel}`}</strong>
        </div>
        <StatusBadge tone={items.length > 0 ? 'success' : isError ? 'danger' : 'neutral'}>
          {isLoading ? '加载中' : isError ? '加载失败' : `${items.length} 个窗口`}
        </StatusBadge>
      </div>

      {isLoading ? (
        <div className="resource-state metric-aggregate-state" role="status">
          <LoaderCircle size={18} aria-hidden="true" />
          <div>
            <strong>正在加载聚合结果</strong>
            <span>按当前筛选读取指标窗口聚合。</span>
          </div>
        </div>
      ) : null}

      {isError ? (
        <div className="resource-state resource-state--error metric-aggregate-state" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>聚合查询失败</strong>
            <span>{formatApiErrorMessage(error)}</span>
          </div>
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <div className="resource-state metric-aggregate-state">
          <BarChart3 size={18} aria-hidden="true" />
          <div>
            <strong>暂无聚合窗口</strong>
            <span>调整指标名、来源、时间范围或窗口后重试。</span>
          </div>
        </div>
      ) : null}

      {!isError && items.length > 0 ? (
        <ol className="metric-aggregate-list">
          {items.map((item) => {
            const magnitude = maxMagnitude > 0 ? Math.min(100, Math.max(6, (Math.abs(item.value) / maxMagnitude) * 100)) : 0;

            return (
              <li key={`${item.project_id}-${item.name}-${item.source ?? 'none'}-${item.window_start}-${item.window_end}`}>
                <div className="metric-aggregate-window">
                  <strong>{formatAggregateWindow(item)}</strong>
                  <span>{`${item.name} / ${item.source || '未标记来源'} / ${item.unit || '无单位'}`}</span>
                </div>
                <div className="metric-aggregate-value">
                  <span>{formatMetricAggregationLabel(item.aggregation)}</span>
                  <strong>{formatNumber(item.value, item.unit)}</strong>
                  <div className="metric-aggregate-bar" aria-hidden="true">
                    <span style={{ inlineSize: `${magnitude}%` }} />
                  </div>
                </div>
                <div className="metric-aggregate-count">
                  <span>样本数</span>
                  <strong>{item.sample_count}</strong>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function renderRecord(signal: QuerySignal, item: QueryRecord, canQuery: boolean, sessionRevision: number) {
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
    return <LogRecord log={log} canQuery={canQuery} sessionRevision={sessionRevision} />;
  }

  if (signal === 'traces') {
    return <TraceRecord span={item as TraceQueryItem} canQuery={canQuery} />;
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
  return <p className="query-record-meta">{formatRecordMeta(item, extra)}</p>;
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

function formatMetricWindowLabel(value: string) {
  const labels: Record<string, string> = {
    '1m': '1 分钟',
    '5m': '5 分钟',
    '15m': '15 分钟',
    '1h': '1 小时'
  };

  return labels[value] ?? value;
}

function formatMetricAggregationLabel(value: string) {
  const labels: Record<string, string> = {
    avg: '平均值',
    sum: '求和',
    min: '最小值',
    max: '最大值',
    count: '计数'
  };

  return labels[value] ?? value;
}

function formatAggregateWindow(item: MetricAggregateItem) {
  return `${formatTime(item.window_start)} - ${formatTime(item.window_end)}`;
}

function formatDuration(value: number | null) {
  if (value === null) {
    return '无耗时';
  }

  return `${Number.isInteger(value) ? value : value.toFixed(3)} ms`;
}

function formatTraceStatus(status: string | null) {
  return status || 'unknown';
}

function getTraceStatusTone(status: string | null) {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('error') || normalized.includes('fail')) {
    return 'danger';
  }

  if (normalized.includes('unset') || normalized.includes('unknown') || normalized === '') {
    return 'neutral';
  }

  return 'success';
}

function getLogLevelTone(level: string) {
  const normalized = level.toLowerCase();
  if (normalized.includes('error') || normalized.includes('fatal')) {
    return 'danger';
  }

  if (normalized.includes('warn')) {
    return 'warning';
  }

  return 'neutral';
}

function formatLogMeta(item: LogQueryItem) {
  return formatRecordMeta(item, [item.source, item.logger, item.trace_id]);
}

function formatRecordMeta(item: QueryRecord, extra: Array<string | null | undefined>) {
  return [`#${item.id}`, `project ${item.project_id}`, formatTime(item.occurred_at ?? item.received_at), ...extra]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, array) => array.indexOf(part) === index)
    .join(' / ');
}

function formatResultSummary(pageNumber: number, count: number) {
  return `第 ${pageNumber} 页，${count} 条记录`;
}

function formatPaginationHint(pageNumber: number, count: number, nextCursor: string | null) {
  if (nextCursor) {
    return `第 ${pageNumber} 页已加载，可继续查看下一页。`;
  }

  if (count > 0) {
    return `第 ${pageNumber} 页已加载，当前筛选已无更多结果。`;
  }

  return '当前筛选暂无结果。';
}
