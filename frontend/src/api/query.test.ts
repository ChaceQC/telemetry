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

  it('空筛选不会生成空查询参数', async () => {
    const { listLogs } = await loadQueryClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    await listLogs({ level: '', source: '', limit: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/query/logs', expect.any(Object));
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
