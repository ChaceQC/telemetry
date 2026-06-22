import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LogContextResponse, LogQueryItem, QueryResultPage } from '../api/query';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { buildLogContextQueryKey, buildSignalQueryKey } from '../features/query/querySession';
import { QueryPage } from './QueryPage';

const defaultLogParams = {
  project_id: undefined,
  source: undefined,
  occurred_from: undefined,
  occurred_to: undefined,
  limit: 100,
  cursor: undefined,
  level: undefined
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

function renderLogsPage(queryClient: QueryClient, auth: AuthContextValue) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/logs']}>
          <QueryPage signal="logs" />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
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
});
