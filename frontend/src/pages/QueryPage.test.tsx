import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../api/http';
import type {
  EventQueryItem,
  LogContextResponse,
  LogQueryItem,
  MetricAggregateItem,
  MetricQueryItem,
  QueryResultPage,
  TraceQueryItem
} from '../api/query';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { buildMetricAggregateParams, buildQueryParams, defaultFilters } from '../features/query/queryFilters';
import { buildLogContextQueryKey, buildSignalQueryKey } from '../features/query/querySession';
import { buildTraceWaterfallGroups } from '../features/query/traceWaterfall';
import { buildTraceWaterfallScopeKey } from '../features/query/traceWaterfallScope';
import { LogContextGroup, QueryPage, TraceDetailPanel, TraceWaterfallView } from './QueryPage';

const defaultLogParams = {
  project_id: undefined,
  source: undefined,
  occurred_from: undefined,
  occurred_to: undefined,
  limit: 100,
  cursor: undefined,
  level: undefined,
  keyword: undefined,
  trace_id: undefined,
  span_id: undefined,
  request_id: undefined,
  user_id: undefined
};

const staleLog: LogQueryItem = {
  id: 42,
  project_id: 7,
  level: 'error',
  message: 'stale cached log message',
  source: 'api',
  logger: 'worker',
  trace_id: 'trace-old',
  span_id: null,
  attributes: {},
  payload: {},
  occurred_at: '2026-06-22T02:00:00Z',
  received_at: '2026-06-22T02:00:01Z'
};

const timelineEvent: EventQueryItem = {
  id: 108,
  project_id: 21,
  type: 'deploy.finished',
  source: 'release-worker',
  payload: {
    deployment: 'checkout',
    duration_ms: 2300,
    ok: true
  },
  occurred_at: '2026-06-22T03:12:00Z',
  received_at: '2026-06-22T03:12:02Z'
};

const currentMetric: MetricQueryItem = {
  id: 8,
  project_id: 21,
  name: 'http.requests',
  value: 123,
  unit: 'count',
  type: 'counter',
  source: 'api',
  tags: {},
  payload: {},
  occurred_at: '2026-06-22T03:10:00Z',
  received_at: '2026-06-22T03:10:01Z'
};

const aggregateMetric: MetricAggregateItem = {
  project_id: 21,
  name: 'http.requests',
  source: 'api',
  window_start: '2026-06-22T03:00:00Z',
  window_end: '2026-06-22T03:05:00Z',
  aggregation: 'avg',
  value: 42.5,
  sample_count: 5,
  unit: 'count'
};

const currentTrace: TraceQueryItem = {
  id: 77,
  project_id: 21,
  trace_id: 'trace-a',
  span_id: 'span-db',
  parent_span_id: 'span-root',
  name: 'SELECT orders',
  start_time: '2026-06-22T03:10:00.020Z',
  end_time: null,
  duration_ms: 30.5,
  status_code: 'error',
  source: 'db',
  attributes: {
    'db.system': 'mysql'
  },
  payload: {
    route: '/api/orders'
  },
  occurred_at: '2026-06-22T03:10:00.020Z',
  received_at: '2026-06-22T03:10:01Z'
};

function createSignedOutAuth(): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isRestoring: false,
    canRequestAuthenticatedApi: false,
    sessionRevision: 0,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null)
  };
}

function createRestoringAuth(): AuthContextValue {
  return {
    user: null,
    isAuthenticated: true,
    isRestoring: true,
    canRequestAuthenticatedApi: false,
    sessionRevision: 1,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null)
  };
}

function createSignedInAuth(): AuthContextValue {
  return {
    user: {
      id: 1,
      username: 'operator',
      display_name: 'Operator',
      email: null,
      roles: []
    },
    isAuthenticated: true,
    isRestoring: false,
    canRequestAuthenticatedApi: true,
    sessionRevision: 1,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null)
  };
}

function renderQueryPage(
  queryClient: QueryClient,
  auth: AuthContextValue,
  signal: 'metrics' | 'logs' | 'traces' | 'events',
  initialEntry = `/${signal}`
) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <QueryPage signal={signal} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function renderLogsPage(queryClient: QueryClient, auth: AuthContextValue) {
  return renderQueryPage(queryClient, auth, 'logs');
}

function seedSignalData<TItem>(
  queryClient: QueryClient,
  signal: 'metrics' | 'logs' | 'traces' | 'events',
  items: TItem[],
  nextCursor: string | null = null
) {
  queryClient.setQueryData<QueryResultPage<TItem>>(buildSignalQueryKey(1, signal, buildQueryParams(signal, defaultFilters), 0), {
    items,
    next_cursor: nextCursor
  });
}

function seedSignalError(
  queryClient: QueryClient,
  signal: 'metrics' | 'logs' | 'traces' | 'events',
  params: unknown,
  error: Error
) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: buildSignalQueryKey(1, signal, params, 0)
    },
    {
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: 0,
      error,
      errorUpdateCount: 1,
      errorUpdatedAt: 1,
      fetchFailureCount: 1,
      fetchFailureReason: error,
      fetchMeta: null,
      isInvalidated: false,
      status: 'error',
      fetchStatus: 'idle'
    }
  );
}

function seedMetricAggregateData(queryClient: QueryClient, items: MetricAggregateItem[]) {
  queryClient.setQueryData(
    buildSignalQueryKey(1, 'metrics-aggregate', buildMetricAggregateParams(defaultFilters), 0),
    { items }
  );
}

describe('QueryPage auth guards', () => {
  it('未登录时不渲染旧 session 缓存的日志列表或上下文', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000
        }
      }
    });

    queryClient.setQueryData<QueryResultPage<LogQueryItem>>(buildSignalQueryKey(0, 'logs', defaultLogParams, 0), {
      items: [staleLog],
      next_cursor: null
    });
    queryClient.setQueryData<LogContextResponse>(buildLogContextQueryKey(0, staleLog.id, 5, 5), {
      target: { ...staleLog, message: 'stale cached context target' },
      before: [{ ...staleLog, id: 41, message: 'stale cached context before' }],
      after: []
    });

    const html = renderLogsPage(queryClient, createSignedOutAuth());

    expect(html).toContain('登录后查询遥测数据');
    expect(html).not.toContain('stale cached log message');
    expect(html).not.toContain('stale cached context target');
    expect(html).not.toContain('stale cached context before');
    expect(html).not.toContain('日志上下文');
  });

  it('会话恢复未完成时暂缓查询视图并隐藏已登录缓存数据', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'logs', [staleLog]);

    const html = renderLogsPage(queryClient, createRestoringAuth());

    expect(html).toContain('正在恢复登录状态');
    expect(html).toContain('会话恢复完成后会自动发起查询。');
    expect(html).toContain('等待查询结果');
    expect(html).not.toContain('stale cached log message');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('查询失败');
  });

  it('会话恢复完成后允许查询视图读取当前 session 查询结果', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'logs', [staleLog]);

    const html = renderLogsPage(queryClient, createSignedInAuth());

    expect(html).toContain('stale cached log message');
    expect(html).toContain('第 1 页，1 条记录');
    expect(html).not.toContain('登录后查询遥测数据');
    expect(html).not.toContain('正在恢复登录状态');
  });

  it('仅 logs 查询表单渲染 logs 专属筛选字段', () => {
    const auth = createSignedOutAuth();
    const logsHtml = renderQueryPage(new QueryClient(), auth, 'logs');
    const metricsHtml = renderQueryPage(new QueryClient(), auth, 'metrics');
    const tracesHtml = renderQueryPage(new QueryClient(), auth, 'traces');
    const eventsHtml = renderQueryPage(new QueryClient(), auth, 'events');

    expect(logsHtml).toContain('关键词');
    expect(logsHtml).toContain('Trace ID');
    expect(logsHtml).toContain('Span ID');
    expect(logsHtml).toContain('Request ID');
    expect(logsHtml).toContain('User ID');
    expect(metricsHtml).not.toContain('关键词');
    expect(metricsHtml).not.toContain('Trace ID');
    expect(metricsHtml).not.toContain('Span ID');
    expect(metricsHtml).not.toContain('Request ID');
    expect(metricsHtml).not.toContain('User ID');
    expect(tracesHtml).toContain('Trace ID');
    expect(tracesHtml).toContain('Span ID');
    expect(tracesHtml).not.toContain('关键词');
    expect(tracesHtml).not.toContain('Request ID');
    expect(tracesHtml).not.toContain('User ID');
    expect(eventsHtml).not.toContain('关键词');
    expect(eventsHtml).not.toContain('Trace ID');
    expect(eventsHtml).not.toContain('Span ID');
    expect(eventsHtml).not.toContain('Request ID');
    expect(eventsHtml).not.toContain('User ID');
  });

  it('仅 metrics 查询表单渲染聚合窗口控件', () => {
    const auth = createSignedOutAuth();
    const metricsHtml = renderQueryPage(new QueryClient(), auth, 'metrics');
    const logsHtml = renderQueryPage(new QueryClient(), auth, 'logs');
    const tracesHtml = renderQueryPage(new QueryClient(), auth, 'traces');
    const eventsHtml = renderQueryPage(new QueryClient(), auth, 'events');

    expect(metricsHtml).toContain('窗口');
    expect(metricsHtml).toContain('聚合方式');
    expect(metricsHtml).toContain('5 分钟');
    expect(metricsHtml).toContain('平均值');
    expect(logsHtml).not.toContain('聚合方式');
    expect(logsHtml).not.toContain('5 分钟');
    expect(tracesHtml).not.toContain('聚合方式');
    expect(tracesHtml).not.toContain('5 分钟');
    expect(eventsHtml).not.toContain('聚合方式');
    expect(eventsHtml).not.toContain('5 分钟');
  });
});

describe('QueryPage traces', () => {
  it('traces 页面按 trace 组展示树形 waterfall、分页控制和基础展开入口', () => {
    const queryClient = new QueryClient();
    const rootTrace: TraceQueryItem = {
      ...currentTrace,
      id: 76,
      span_id: 'span-root',
      parent_span_id: null,
      name: 'GET /api/orders',
      start_time: '2026-06-22T03:10:00.000Z',
      end_time: '2026-06-22T03:10:01.200Z',
      duration_ms: 1200,
      status_code: 'ok',
      source: 'api'
    };
    const orphanTrace: TraceQueryItem = {
      ...currentTrace,
      id: 78,
      span_id: 'span-orphan',
      parent_span_id: 'span-missing',
      name: 'publish event',
      start_time: '2026-06-22T03:10:00.500Z',
      end_time: null,
      duration_ms: null,
      status_code: 'ok',
      source: 'worker'
    };
    seedSignalData(queryClient, 'traces', [currentTrace, rootTrace, orphanTrace], 'trace-cursor-2');

    const html = renderQueryPage(queryClient, createSignedInAuth(), 'traces');

    expect(html).toContain('链路查询');
    expect(html).toContain('Span 名称');
    expect(html).toContain('1 个 trace 组 / 3 条 span');
    expect(html).toContain('class="trace-waterfall-list"');
    expect(html).toContain('Trace trace-a');
    expect(html).toContain('GET /api/orders');
    expect(html).toContain('SELECT orders');
    expect(html).toContain('publish event');
    expect(html).toContain('error');
    expect(html).toContain('慢');
    expect(html).toContain('缺 parent');
    expect(html).toContain('时间不完整');
    expect(html).toContain('30.500 ms');
    expect(html).toContain('trace-a');
    expect(html).toContain('span-db');
    expect(html).toContain('查看相关日志');
    expect(html).toContain('href="/logs?trace_id=trace-a"');
    expect(html).toContain('href="/logs?trace_id=trace-a&amp;span_id=span-root"');
    expect(html).toContain('href="/logs?trace_id=trace-a&amp;span_id=span-db"');
    expect(html).toContain('展开详情');
    expect(html).toContain('回第一页');
    expect(html).toContain('下一页');
    expect(html).toContain('第 1 页已加载，可继续查看下一页。');
    expect(html).not.toContain('Request ID');
    expect(html).not.toContain('聚合窗口');
    expect(html).not.toContain('class="event-timeline"');
    expect(html).not.toContain('class="query-list"');
    expect(html.indexOf('GET /api/orders')).toBeLessThan(html.indexOf('SELECT orders'));
  });

  it('trace 展开详情在 attributes 和 payload 为 null 时稳定展示 JSON 占位', () => {
    const traceWithNullJson: TraceQueryItem = {
      ...currentTrace,
      span_id: 'span-null-json',
      attributes: null,
      payload: null
    };

    const html = renderToString(<TraceDetailPanel span={traceWithNullJson} />);

    expect(html).toContain('Span span-null-json 详情');
    expect(html).toContain('<span>attributes</span>null');
    expect(html).toContain('<span>payload</span>null');
  });

  it('trace 组收起时仅保留组头，不渲染组内 span 行', () => {
    const groups = buildTraceWaterfallGroups([currentTrace]);

    const html = renderToString(
      <MemoryRouter>
        <TraceWaterfallView groups={groups} canQuery defaultExpanded={false} />
      </MemoryRouter>
    );

    expect(html).toContain('Trace trace-a');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('SELECT orders');
    expect(html).not.toContain('class="trace-span-row');
  });

  it('trace waterfall 展开状态 scope 覆盖分页、刷新、session 和筛选参数', () => {
    const firstPageKey = buildTraceWaterfallScopeKey(1, 1, 0, {
      ...buildQueryParams('traces', defaultFilters),
      trace_id: 'trace-a'
    });
    const nextPageKey = buildTraceWaterfallScopeKey(1, 2, 0, {
      ...buildQueryParams('traces', defaultFilters),
      trace_id: 'trace-a',
      cursor: 'trace-cursor-2'
    });
    const refreshedKey = buildTraceWaterfallScopeKey(1, 1, 1, {
      ...buildQueryParams('traces', defaultFilters),
      trace_id: 'trace-a'
    });
    const filteredKey = buildTraceWaterfallScopeKey(1, 1, 0, {
      ...buildQueryParams('traces', defaultFilters),
      trace_id: 'trace-b'
    });
    const nextSessionKey = buildTraceWaterfallScopeKey(2, 1, 0, {
      ...buildQueryParams('traces', defaultFilters),
      trace_id: 'trace-a'
    });

    expect(firstPageKey).not.toBe(nextPageKey);
    expect(firstPageKey).not.toBe(refreshedKey);
    expect(firstPageKey).not.toBe(filteredKey);
    expect(firstPageKey).not.toBe(nextSessionKey);
  });
});

describe('QueryPage logs URL filters', () => {
  it('logs 查询结果有 trace_id 时显示相关 Trace 跳转并按需携带 span_id', () => {
    const queryClient = new QueryClient();
    const traceOnlyLog: LogQueryItem = {
      ...staleLog,
      id: 43,
      trace_id: 'trace-only',
      span_id: null,
      message: 'trace-only log'
    };
    const traceSpanLog: LogQueryItem = {
      ...staleLog,
      id: 44,
      trace_id: 'trace/a',
      span_id: 'span b',
      message: 'trace span log'
    };
    const noTraceLog: LogQueryItem = {
      ...staleLog,
      id: 45,
      trace_id: null,
      span_id: 'span-only',
      message: 'no trace log'
    };
    seedSignalData(queryClient, 'logs', [traceOnlyLog, traceSpanLog, noTraceLog]);

    const html = renderQueryPage(queryClient, createSignedInAuth(), 'logs');

    expect(html.match(/href="\/traces\?/g)).toHaveLength(2);
    expect(html).toContain('href="/traces?trace_id=trace-only"');
    expect(html).toContain('href="/traces?trace_id=trace%2Fa&amp;span_id=span+b"');
    expect(html).toContain('no trace log');
    expect(html).not.toContain('span-only"');
  });

  it('日志上下文详情有 trace_id 时显示相关 Trace 跳转，没有 trace_id 时不显示', () => {
    const detailLog: LogQueryItem = {
      ...staleLog,
      id: 46,
      trace_id: ' trace/detail ',
      span_id: ' span detail ',
      message: 'detail trace log'
    };
    const noTraceDetailLog: LogQueryItem = {
      ...staleLog,
      id: 47,
      trace_id: null,
      span_id: 'span-only',
      message: 'detail without trace'
    };

    const html = renderToString(
      <MemoryRouter>
        <LogContextGroup title="Target" logs={[detailLog, noTraceDetailLog]} emptyText="empty" isTarget />
      </MemoryRouter>
    );

    expect(html.match(/href="\/traces\?/g)).toHaveLength(1);
    expect(html).toContain('href="/traces?trace_id=trace%2Fdetail&amp;span_id=span+detail"');
    expect(html).toContain('detail without trace');
    expect(html).not.toContain('span-only"');
  });

  it('logs 页面从 URL 初始化 Trace ID / Span ID 筛选并读取对应缓存结果', () => {
    const queryClient = new QueryClient();
    const filters = {
      ...defaultFilters,
      traceId: 'trace-url',
      spanId: 'span-url'
    };
    const linkedLog: LogQueryItem = {
      ...staleLog,
      id: 43,
      trace_id: 'trace-url',
      span_id: 'span-url',
      message: 'linked trace log'
    };

    queryClient.setQueryData<QueryResultPage<LogQueryItem>>(
      buildSignalQueryKey(1, 'logs', buildQueryParams('logs', filters), 0),
      {
        items: [linkedLog],
        next_cursor: null
      }
    );

    const html = renderQueryPage(
      queryClient,
      createSignedInAuth(),
      'logs',
      '/logs?trace_id=trace-url&span_id=span-url'
    );

    expect(html).toContain('已应用关联日志筛选：Trace ID: trace-url / Span ID: span-url。');
    expect(html).toContain('value="trace-url"');
    expect(html).toContain('value="span-url"');
    expect(html).toContain('linked trace log');
    expect(html).toContain('第 1 页，1 条记录');
  });

  it('traces 页面从 URL 初始化 Trace ID / Span ID 筛选并读取对应缓存结果', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'traces', [currentTrace]);
    const filters = {
      ...defaultFilters,
      traceId: 'trace-url',
      spanId: 'span-url'
    };
    const linkedTrace: TraceQueryItem = {
      ...currentTrace,
      id: 79,
      trace_id: 'trace-url',
      span_id: 'span-url',
      name: 'linked URL trace'
    };

    queryClient.setQueryData<QueryResultPage<TraceQueryItem>>(
      buildSignalQueryKey(1, 'traces', buildQueryParams('traces', filters), 0),
      {
        items: [linkedTrace],
        next_cursor: null
      }
    );

    const html = renderQueryPage(
      queryClient,
      createSignedInAuth(),
      'traces',
      '/traces?trace_id=trace-url&span_id=span-url'
    );

    expect(html).toContain('链路查询');
    expect(html).toContain('已应用链路筛选：Trace ID: trace-url / Span ID: span-url。');
    expect(html).toContain('value="trace-url"');
    expect(html).toContain('value="span-url"');
    expect(html).toContain('linked URL trace');
    expect(html).toContain('第 1 页，1 个 trace 组 / 1 条 span');
    expect(html).not.toContain('SELECT orders');
    expect(html).not.toContain('已应用关联日志筛选');
  });

  it('traces 页面保留超长 URL trace_id 并展示后端 422 错误态', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retryOnMount: false
        }
      }
    });
    const overlongTraceId = 't'.repeat(129);
    const filters = {
      ...defaultFilters,
      traceId: overlongTraceId
    };
    seedSignalData(queryClient, 'traces', [currentTrace]);
    seedSignalError(
      queryClient,
      'traces',
      buildQueryParams('traces', filters),
      new ApiClientError({
        message: 'validation failed',
        status: 422,
        details: {
          detail: [{ loc: ['query', 'trace_id'], msg: 'String should have at most 128 characters' }]
        }
      })
    );

    const html = renderQueryPage(
      queryClient,
      createSignedInAuth(),
      'traces',
      `/traces?trace_id=${overlongTraceId}`
    );

    expect(html).toContain('查询失败');
    expect(html).toContain('请求参数未通过校验，请刷新页面后重试。');
    expect(html).toContain('query.trace_id: String should have at most 128 characters');
    expect(html).toContain(`value="${overlongTraceId}"`);
    expect(html).not.toContain('SELECT orders');
    expect(html).not.toContain('class="trace-waterfall-list"');
  });

  it('metrics 和 events 页面忽略 URL 中的 trace/span 参数', () => {
    const metricsClient = new QueryClient();
    const eventsClient = new QueryClient();
    seedSignalData(metricsClient, 'metrics', [currentMetric]);
    seedMetricAggregateData(metricsClient, [aggregateMetric]);
    seedSignalData(eventsClient, 'events', [timelineEvent]);

    const metricsHtml = renderQueryPage(
      metricsClient,
      createSignedInAuth(),
      'metrics',
      '/metrics?trace_id=ignored-trace&span_id=ignored-span'
    );
    const eventsHtml = renderQueryPage(
      eventsClient,
      createSignedInAuth(),
      'events',
      '/events?trace_id=ignored-trace&span_id=ignored-span'
    );

    expect(metricsHtml).toContain('http.requests');
    expect(eventsHtml).toContain('deploy.finished');
    expect(metricsHtml).not.toContain('已应用关联日志筛选');
    expect(eventsHtml).not.toContain('已应用关联日志筛选');
    expect(metricsHtml).not.toContain('查看相关 Trace');
    expect(eventsHtml).not.toContain('查看相关 Trace');
    expect(metricsHtml).not.toContain('ignored-trace');
    expect(eventsHtml).not.toContain('ignored-span');
  });
});

describe('QueryPage events timeline', () => {
  it('events 页面按时间线展示事件关键信息和 payload 摘要', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'events', [timelineEvent]);

    const html = renderQueryPage(queryClient, createSignedInAuth(), 'events');

    expect(html).toContain('事件时间线');
    expect(html).toContain('class="event-timeline"');
    expect(html).toContain('deploy.finished');
    expect(html).toContain('release-worker');
    expect(html).toContain('Occurred');
    expect(html).toContain('Received');
    expect(html).toContain('Project');
    expect(html).toContain('payload 摘要');
    expect(html).toContain('deployment: checkout / duration_ms: 2300 / ok: true');
    expect(html).not.toContain('class="query-list"');
  });

  it('metrics 和 logs 仍使用原结果列表展示', () => {
    const auth = createSignedInAuth();
    const metricsClient = new QueryClient();
    const logsClient = new QueryClient();
    seedSignalData(metricsClient, 'metrics', [{ ...currentMetric, name: 'http.errors' }, currentMetric]);
    seedSignalData(logsClient, 'logs', [staleLog]);

    const metricsHtml = renderQueryPage(metricsClient, auth, 'metrics');
    const logsHtml = renderQueryPage(logsClient, auth, 'logs');

    expect(metricsHtml).toContain('class="query-list"');
    expect(metricsHtml).not.toContain('class="event-timeline"');
    expect(metricsHtml).not.toContain('class="trace-waterfall-list"');
    expect(logsHtml).toContain('class="query-list"');
    expect(logsHtml).not.toContain('class="event-timeline"');
    expect(logsHtml).not.toContain('class="trace-waterfall-list"');
  });
});

describe('QueryPage metric aggregates', () => {
  it('metrics 页面在当前页趋势之外展示聚合窗口结果', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'metrics', [currentMetric]);
    seedMetricAggregateData(queryClient, [aggregateMetric]);

    const html = renderQueryPage(queryClient, createSignedInAuth(), 'metrics');

    expect(html).toContain('当前页趋势');
    expect(html).toContain('聚合窗口');
    expect(html).toContain('5 分钟 / 平均值');
    expect(html).toContain('http.requests / api / count');
    expect(html).toContain('42.500 count');
    expect(html).toContain('样本数');
    expect(html).toContain('5');
  });

  it('logs 和 events 页面不渲染聚合结果视图', () => {
    const logsClient = new QueryClient();
    const eventsClient = new QueryClient();
    seedSignalData(logsClient, 'logs', [staleLog]);
    seedSignalData(eventsClient, 'events', [timelineEvent]);

    const logsHtml = renderQueryPage(logsClient, createSignedInAuth(), 'logs');
    const eventsHtml = renderQueryPage(eventsClient, createSignedInAuth(), 'events');

    expect(logsHtml).not.toContain('聚合窗口');
    expect(eventsHtml).not.toContain('聚合窗口');
  });
});
