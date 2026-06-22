import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadQueryClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  const [query, http] = await Promise.all([import('./query'), import('./http')]);
  return { ...query, ...http };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('query api client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('指标查询会携带筛选参数和当前 session token', async () => {
    const { listMetrics, setApiAuthToken } = await loadQueryClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [], next_cursor: 'metric-cursor-2' }));

    setApiAuthToken('query-token');
    const result = await listMetrics({
      project_id: 12,
      name: 'http.requests',
      source: 'api',
      occurred_from: '2026-06-20T10:00',
      occurred_to: '2026-06-20T11:00',
      limit: 50,
      cursor: 'metric-cursor-1'
    });

    expect(result).toEqual({ items: [], next_cursor: 'metric-cursor-2' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/metrics?project_id=12&name=http.requests&source=api&occurred_from=2026-06-20T10%3A00&occurred_to=2026-06-20T11%3A00&limit=50&cursor=metric-cursor-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer query-token'
        })
      })
    );
  });

  it('指标聚合查询会携带窗口和聚合参数但不使用 cursor', async () => {
    const { listMetricAggregates, setApiAuthToken } = await loadQueryClient();
    const response = {
      items: [
        {
          project_id: 12,
          name: 'http.requests',
          source: 'api',
          window_start: '2026-06-20T10:00:00Z',
          window_end: '2026-06-20T10:05:00Z',
          aggregation: 'avg',
          value: 12.5,
          sample_count: 4,
          unit: 'count'
        }
      ]
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    setApiAuthToken('query-token');
    await expect(
      listMetricAggregates({
        project_id: 12,
        name: 'http.requests',
        source: 'api',
        occurred_from: '2026-06-20T10:00',
        occurred_to: '2026-06-20T11:00',
        window: '5m',
        aggregation: 'avg',
        limit: 20,
        cursor: 'ignored-cursor'
      } as never)
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/metrics/aggregate?project_id=12&name=http.requests&source=api&occurred_from=2026-06-20T10%3A00&occurred_to=2026-06-20T11%3A00&window=5m&aggregation=avg&limit=20',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer query-token'
        })
      })
    );
  });

  it('空筛选不会生成空查询参数', async () => {
    const { listLogs } = await loadQueryClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    await listLogs({ level: '', request_id: ' ', user_id: '', source: '', limit: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/query/logs', expect.any(Object));
  });

  it('日志查询会携带关键词、trace/span 和 request/user 筛选参数', async () => {
    const { listLogs } = await loadQueryClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    await listLogs({
      level: 'error',
      keyword: 'timeout retry',
      trace_id: ' trace-abc ',
      span_id: ' span-def ',
      request_id: ' req-789 ',
      user_id: ' user-123 ',
      cursor: 'log-cursor-1'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/logs?level=error&keyword=timeout+retry&trace_id=trace-abc&span_id=span-def&request_id=req-789&user_id=user-123&cursor=log-cursor-1',
      expect.any(Object)
    );
  });

  it('Trace 查询会携带 trace/span/name/source/time/limit/cursor 筛选参数', async () => {
    const { listTraces, setApiAuthToken } = await loadQueryClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [], next_cursor: 'trace-cursor-2' }));

    setApiAuthToken('query-token');
    const result = await listTraces({
      project_id: 12,
      trace_id: ' trace-abc ',
      span_id: ' span-def ',
      name: 'GET /api/orders',
      source: 'api',
      occurred_from: '2026-06-20T10:00',
      occurred_to: '2026-06-20T11:00',
      limit: 50,
      cursor: 'trace-cursor-1'
    });

    expect(result).toEqual({ items: [], next_cursor: 'trace-cursor-2' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/traces?project_id=12&trace_id=trace-abc&span_id=span-def&name=GET+%2Fapi%2Forders&source=api&occurred_from=2026-06-20T10%3A00&occurred_to=2026-06-20T11%3A00&limit=50&cursor=trace-cursor-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer query-token'
        })
      })
    );
  });

  it('metrics 和 events 查询不会透传误传的 logs 专属参数', async () => {
    const { listMetrics, listEvents } = await loadQueryClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse({ items: [], next_cursor: null })));

    await listMetrics({
      name: 'http.requests',
      keyword: 'ignored',
      trace_id: 'ignored',
      span_id: 'ignored',
      request_id: 'ignored',
      user_id: 'ignored'
    } as never);
    await listEvents({
      type: 'deploy.started',
      keyword: 'ignored',
      trace_id: 'ignored',
      span_id: 'ignored',
      request_id: 'ignored',
      user_id: 'ignored'
    } as never);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:28117/api/v1/query/metrics?name=http.requests',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:28117/api/v1/query/events?type=deploy.started',
      expect.any(Object)
    );
  });

  it('查询 client 兼容后端旧数组响应并转换为第一页 envelope', async () => {
    const { listEvents } = await loadQueryClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{ id: 1, type: 'deployment' }]));

    await expect(listEvents()).resolves.toEqual({
      items: [{ id: 1, type: 'deployment' }],
      next_cursor: null
    });
  });

  it('日志上下文查询会携带默认窗口和当前 session token', async () => {
    const { getLogContext, setApiAuthToken } = await loadQueryClient();
    const response = {
      target: { id: 42, level: 'error', message: 'failed' },
      before: [],
      after: []
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    setApiAuthToken('query-token');

    await expect(getLogContext(42)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/logs/42/context?before=5&after=5',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer query-token'
        })
      })
    );
  });

  it('日志上下文窗口会裁剪到 0 到 20', async () => {
    const { getLogContext, normalizeLogContextWindow } = await loadQueryClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ target: null, before: [], after: [] }));

    expect(normalizeLogContextWindow(-3)).toBe(0);
    expect(normalizeLogContextWindow(27)).toBe(20);
    expect(normalizeLogContextWindow(Number.NaN)).toBe(5);

    await getLogContext(42, { before: -3, after: 27 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/logs/42/context?before=0&after=20',
      expect.any(Object)
    );
  });
});
