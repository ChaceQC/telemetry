import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
import { QueryPage, TraceDetailPanel } from './QueryPage';

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
    sessionRevision: 0,
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
  signal: 'metrics' | 'logs' | 'traces' | 'events'
) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[`/${signal}`]}>
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
  it('traces 页面展示 span 列表、分页控制和基础展开入口', () => {
    const queryClient = new QueryClient();
    seedSignalData(queryClient, 'traces', [currentTrace], 'trace-cursor-2');

    const html = renderQueryPage(queryClient, createSignedInAuth(), 'traces');

    expect(html).toContain('链路查询');
    expect(html).toContain('Span 名称');
    expect(html).toContain('SELECT orders');
    expect(html).toContain('error');
    expect(html).toContain('30.500 ms');
    expect(html).toContain('trace-a');
    expect(html).toContain('span-db');
    expect(html).toContain('展开详情');
    expect(html).toContain('回第一页');
    expect(html).toContain('下一页');
    expect(html).toContain('第 1 页已加载，可继续查看下一页。');
    expect(html).not.toContain('Request ID');
    expect(html).not.toContain('聚合窗口');
    expect(html).not.toContain('class="event-timeline"');
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
    expect(logsHtml).toContain('class="query-list"');
    expect(logsHtml).not.toContain('class="event-timeline"');
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
