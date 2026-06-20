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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    setApiAuthToken('query-token');
    await listMetrics({
      project_id: 12,
      name: 'http.requests',
      source: 'api',
      occurred_from: '2026-06-20T10:00',
      occurred_to: '2026-06-20T11:00',
      limit: 50
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/metrics?project_id=12&name=http.requests&source=api&occurred_from=2026-06-20T10%3A00&occurred_to=2026-06-20T11%3A00&limit=50',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer query-token'
        })
      })
    );
  });

  it('空筛选不会生成空查询参数', async () => {
    const { listLogs } = await loadQueryClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    await listLogs({ level: '', source: '', limit: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/query/logs', expect.any(Object));
  });
});
