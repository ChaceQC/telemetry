import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadIngestStatsClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('./ingestStats');
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

  it('摄入统计查询会携带筛选参数和 cookie 会话', async () => {
    const { listIngestStats } = await loadIngestStatsClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    await listIngestStats({ project_id: 7, kind: 'metric', limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/ingest/stats?project_id=7&kind=metric&limit=25',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
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
