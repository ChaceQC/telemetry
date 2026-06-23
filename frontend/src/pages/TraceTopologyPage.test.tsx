import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../api/http';
import type { TraceTopologyResponse } from '../api/query';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { buildTraceTopologyParams, defaultFilters, type QueryFilters } from '../features/query/queryFilters';
import { buildSignalQueryKey } from '../features/query/querySession';
import { TraceTopologyPage } from './TraceTopologyPage';

const topologyResponse: TraceTopologyResponse = {
  nodes: [
    {
      source: 'api',
      span_count: 12,
      trace_count: 4,
      error_span_count: 2,
      avg_duration_ms: 38.5,
      max_duration_ms: 120
    },
    {
      source: 'worker',
      span_count: 6,
      trace_count: 3,
      error_span_count: 0,
      avg_duration_ms: 24,
      max_duration_ms: 70
    }
  ],
  edges: [
    {
      from_source: 'api',
      to_source: 'worker',
      call_count: 6,
      error_count: 1,
      avg_duration_ms: 24.5,
      max_duration_ms: 70
    }
  ]
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

function renderTopologyPage(
  queryClient: QueryClient,
  auth: AuthContextValue,
  initialEntry = '/traces/topology'
) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <TraceTopologyPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function buildTopologyTestParams(overrides: Partial<QueryFilters> = {}) {
  return buildTraceTopologyParams({
    ...defaultFilters,
    projectId: '21',
    source: 'api',
    limit: '50',
    ...overrides
  });
}

function seedTopologyData(
  queryClient: QueryClient,
  response: TraceTopologyResponse,
  overrides: Partial<QueryFilters> = {},
  sessionRevision = 1
) {
  queryClient.setQueryData(
    buildSignalQueryKey(sessionRevision, 'traces-topology', buildTopologyTestParams(overrides), 0),
    response
  );
}

function seedTopologyError(queryClient: QueryClient, error: Error) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: buildSignalQueryKey(1, 'traces-topology', buildTopologyTestParams(), 0)
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

function seedTopologyLoading(queryClient: QueryClient) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: buildSignalQueryKey(1, 'traces-topology', buildTopologyTestParams(), 0)
    },
    {
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: 0,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: 'pending',
      fetchStatus: 'fetching'
    }
  );
}

describe('TraceTopologyPage', () => {
  it('未登录时显示登录提示并隐藏旧拓扑缓存', () => {
    const queryClient = new QueryClient();
    seedTopologyData(queryClient, topologyResponse, {}, 0);

    const html = renderTopologyPage(queryClient, createSignedOutAuth(), '/traces/topology?project_id=21&source=api&limit=50');

    expect(html).toContain('登录后查询服务拓扑');
    expect(html).toContain('服务拓扑接口需要使用当前账号的访问令牌。');
    expect(html).not.toContain('worker');
    expect(html).not.toContain('拓扑查询失败');
  });

  it('已登录但未填写 project_id 时提示必填且不渲染旧数据', () => {
    const queryClient = new QueryClient();
    seedTopologyData(queryClient, topologyResponse);

    const html = renderTopologyPage(queryClient, createSignedInAuth(), '/traces/topology?trace_id=ignored&span_id=ignored');

    expect(html).toContain('项目 ID 必填');
    expect(html).toContain('服务拓扑需要先指定项目 ID。');
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="ignored"');
    expect(html).not.toContain('worker');
  });

  it('按 URL 初始化筛选并展示 nodes 和 edges 摘要', () => {
    const queryClient = new QueryClient();
    seedTopologyData(queryClient, topologyResponse, {
      occurredFrom: '2026-06-20T10:00',
      occurredTo: '2026-06-20T11:00'
    });

    const html = renderTopologyPage(
      queryClient,
      createSignedInAuth(),
      '/traces/topology?project_id=21&source=api&occurred_from=2026-06-20T10:00&occurred_to=2026-06-20T11:00&limit=50'
    );

    expect(html).toContain('服务拓扑');
    expect(html).toContain('项目 21 / 来源 api / 从 2026-06-20T10:00 / 到 2026-06-20T11:00 / 最多 50 个节点');
    expect(html).toContain('2 个服务节点 / 1 条调用边');
    expect(html).toContain('api');
    expect(html).toContain('worker');
    expect(html).toContain('12');
    expect(html).toContain('4');
    expect(html).toContain('2 错误 span');
    expect(html).toContain('38.500 ms');
    expect(html).toContain('120 ms');
    expect(html).toContain('6');
    expect(html).toContain('1');
    expect(html).toContain('24.500 ms');
    expect(html).toContain('70 ms');
    expect(html).toContain('value="21"');
    expect(html).toContain('value="api"');
    expect(html).toContain('value="50"');
    expect(html).not.toContain('Trace ID');
    expect(html).not.toContain('Span ID');
  });

  it('带短横线的调用边不会产生重复 key warning', () => {
    const queryClient = new QueryClient();
    seedTopologyData(queryClient, {
      nodes: [
        {
          source: 'api-worker',
          span_count: 2,
          trace_count: 1,
          error_span_count: 0,
          avg_duration_ms: 10,
          max_duration_ms: 20
        },
        {
          source: 'api',
          span_count: 2,
          trace_count: 1,
          error_span_count: 0,
          avg_duration_ms: 10,
          max_duration_ms: 20
        },
        {
          source: 'db',
          span_count: 2,
          trace_count: 1,
          error_span_count: 0,
          avg_duration_ms: 10,
          max_duration_ms: 20
        },
        {
          source: 'worker-db',
          span_count: 2,
          trace_count: 1,
          error_span_count: 0,
          avg_duration_ms: 10,
          max_duration_ms: 20
        }
      ],
      edges: [
        {
          from_source: 'api-worker',
          to_source: 'db',
          call_count: 3,
          error_count: 0,
          avg_duration_ms: 10,
          max_duration_ms: 20
        },
        {
          from_source: 'api',
          to_source: 'worker-db',
          call_count: 4,
          error_count: 1,
          avg_duration_ms: 15,
          max_duration_ms: 25
        }
      ]
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const html = renderTopologyPage(queryClient, createSignedInAuth(), '/traces/topology?project_id=21&source=api&limit=50');

      expect(html).toContain('4 个服务节点 / 2 条调用边');
      expect(html.match(/class="topology-edge"/g)).toHaveLength(2);
      expect(html).toContain('api-worker');
      expect(html).toContain('worker-db');
      expect(html).toContain('3');
      expect(html).toContain('4');
      const duplicateKeyWarning = consoleErrorSpy.mock.calls.some((call) =>
        call.some((value) => String(value).includes('Encountered two children with the same key'))
      );
      expect(duplicateKeyWarning).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('空拓扑响应展示 empty 状态', () => {
    const queryClient = new QueryClient();
    seedTopologyData(queryClient, { nodes: [], edges: [] });

    const html = renderTopologyPage(queryClient, createSignedInAuth(), '/traces/topology?project_id=21&source=api&limit=50');

    expect(html).toContain('暂无拓扑数据');
    expect(html).toContain('0 个服务节点 / 0 条调用边');
    expect(html).not.toContain('class="topology-grid"');
  });

  it('拓扑查询失败时展示后端错误信息', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retryOnMount: false
        }
      }
    });
    seedTopologyError(
      queryClient,
      new ApiClientError({
        message: 'project missing',
        status: 404,
        details: { detail: '项目不存在' }
      })
    );

    const html = renderTopologyPage(queryClient, createSignedInAuth(), '/traces/topology?project_id=21&source=api&limit=50');

    expect(html).toContain('拓扑查询失败');
    expect(html).toContain('项目不存在');
    expect(html).not.toContain('class="topology-grid"');
  });

  it('拓扑查询加载中时展示 loading 状态', () => {
    const queryClient = new QueryClient();
    seedTopologyLoading(queryClient);

    const html = renderTopologyPage(queryClient, createSignedInAuth(), '/traces/topology?project_id=21&source=api&limit=50');

    expect(html).toContain('正在加载服务拓扑');
    expect(html).toContain('按当前项目、来源和时间范围读取节点与调用边。');
    expect(html).not.toContain('暂无拓扑数据');
  });
});
