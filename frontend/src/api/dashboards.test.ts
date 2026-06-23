import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadDashboardClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  const [dashboards, http] = await Promise.all([import('./dashboards'), import('./http')]);
  return { ...dashboards, ...http };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('dashboard api client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('列表请求携带 project_id、limit、offset 和当前 token', async () => {
    const { listDashboards, setApiAuthToken } = await loadDashboardClient();
    const response = { items: [], limit: 25, offset: 50, total: 0 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    setApiAuthToken('dashboard-token');
    await expect(listDashboards({ project_id: 12, limit: 25, offset: 50 })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/dashboards?project_id=12&limit=25&offset=50',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer dashboard-token'
        })
      })
    );
  });

  it('创建请求只清理 undefined 字段，保留 description=null 和 JSON 数组', async () => {
    const { createDashboard } = await loadDashboardClient();
    const response = {
      id: 1,
      project_id: 12,
      name: '服务总览',
      description: null,
      layout: [],
      config: {},
      created_by_user_id: 1,
      updated_by_user_id: 1,
      created_at: '2026-06-23T10:20:00Z',
      updated_at: '2026-06-23T10:20:00Z'
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response, 201));

    await expect(
      createDashboard({
        project_id: 12,
        name: '服务总览',
        description: null,
        layout: [],
        config: undefined
      })
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/dashboards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          project_id: 12,
          name: '服务总览',
          description: null,
          layout: []
        })
      })
    );
  });

  it('更新和删除使用项目边界路径', async () => {
    const { updateDashboard, deleteDashboard } = await loadDashboardClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 7, project_id: 12, name: 'updated' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await updateDashboard(12, 7, {
      name: 'updated',
      description: null,
      layout: { version: 1 },
      config: []
    });
    await deleteDashboard(12, 7);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:28117/api/v1/projects/12/dashboards/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'updated',
          description: null,
          layout: { version: 1 },
          config: []
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:28117/api/v1/projects/12/dashboards/7',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });

  it('空列表参数不生成空查询串', async () => {
    const { listDashboards } = await loadDashboardClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], limit: 50, offset: 0, total: 0 }));

    await listDashboards({ project_id: undefined, limit: undefined, offset: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/dashboards', expect.any(Object));
  });
});
