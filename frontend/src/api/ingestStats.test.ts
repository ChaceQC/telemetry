import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadIngestStatsClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  const [ingestStats, http] = await Promise.all([import('./ingestStats'), import('./http')]);
  return { ...ingestStats, ...http };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('ingest stats api client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('摄入统计查询会携带筛选参数和当前 session token', async () => {
    const { listIngestStats, setApiAuthToken } = await loadIngestStatsClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    setApiAuthToken('stats-token');
    await listIngestStats({ project_id: 7, kind: 'metric', limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/ingest/stats?project_id=7&kind=metric&limit=25',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stats-token'
        })
      })
    );
  });

  it('空筛选不会生成空查询参数', async () => {
    const { listIngestStats } = await loadIngestStatsClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    await listIngestStats({ project_id: undefined, kind: undefined, limit: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/ingest/stats', expect.any(Object));
  });
});
