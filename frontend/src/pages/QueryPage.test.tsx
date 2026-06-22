import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EventQueryItem, LogContextResponse, LogQueryItem, MetricQueryItem, QueryResultPage } from '../api/query';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { buildQueryParams, defaultFilters } from '../features/query/queryFilters';
import { buildLogContextQueryKey, buildSignalQueryKey } from '../features/query/querySession';
import { QueryPage } from './QueryPage';

const defaultLogParams = {
  project_id: undefined,
  source: undefined,
  occurred_from: undefined,
  occurred_to: undefined,
  limit: 100,
  cursor: undefined,
  level: undefined,
  keyword: undefined
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

function renderQueryPage(queryClient: QueryClient, auth: AuthContextValue, signal: 'metrics' | 'logs' | 'events') {
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
  signal: 'metrics' | 'logs' | 'events',
  items: TItem[],
  nextCursor: string | null = null
) {
  queryClient.setQueryData<QueryResultPage<TItem>>(buildSignalQueryKey(1, signal, buildQueryParams(signal, defaultFilters), 0), {
    items,
    next_cursor: nextCursor
  });
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

  it('仅 logs 查询表单渲染关键词筛选', () => {
    const auth = createSignedOutAuth();

    expect(renderQueryPage(new QueryClient(), auth, 'logs')).toContain('关键词');
    expect(renderQueryPage(new QueryClient(), auth, 'metrics')).not.toContain('关键词');
    expect(renderQueryPage(new QueryClient(), auth, 'events')).not.toContain('关键词');
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
