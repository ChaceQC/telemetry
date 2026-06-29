import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadDashboardClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('./dashboards');
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

  it('列表请求携带 project_id、limit、offset 和 cookie 会话', async () => {
    const { listDashboards } = await loadDashboardClient();
    const response = { items: [], limit: 25, offset: 50, total: 0 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    await expect(listDashboards({ project_id: 12, limit: 25, offset: 50 })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/dashboards?project_id=12&limit=25&offset=50',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
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

  it('模板列表、详情和从模板创建使用后端模板路径', async () => {
    const { listDashboardTemplates, getDashboardTemplate, createDashboardFromTemplate } = await loadDashboardClient();
    const template = {
      id: 'service-overview',
      name: '服务总览',
      description: '服务健康入口',
      layout: { version: 1 },
      config: { panels: [] }
    };
    const dashboard = {
      id: 9,
      project_id: 12,
      name: '支付服务总览',
      description: '支付团队值班入口',
      layout: template.layout,
      config: template.config,
      created_by_user_id: 1,
      updated_by_user_id: 1,
      created_at: '2026-06-25T04:20:00Z',
      updated_at: '2026-06-25T04:20:00Z'
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ items: [template] }))
      .mockResolvedValueOnce(jsonResponse(template))
      .mockResolvedValueOnce(jsonResponse(dashboard, 201));

    await expect(listDashboardTemplates()).resolves.toEqual({ items: [template] });
    await expect(getDashboardTemplate('service overview')).resolves.toEqual(template);
    await expect(
      createDashboardFromTemplate(12, 'service overview', {
        name: '支付服务总览',
        description: undefined
      })
    ).resolves.toEqual(dashboard);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:28117/api/v1/dashboard-templates',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:28117/api/v1/dashboard-templates/service%20overview',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:28117/api/v1/projects/12/dashboard-templates/service%20overview/dashboards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: '支付服务总览'
        }),
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
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

  it('导入导出使用项目边界路径且导入只清理 undefined 字段', async () => {
    const { importDashboard, exportDashboard } = await loadDashboardClient();
    const document = {
      schema: 'telemetry.dashboard',
      version: 1,
      name: '服务总览',
      description: null,
      layout: { version: 1 },
      config: { panels: [] }
    } as const;
    const dashboard = {
      id: 7,
      project_id: 12,
      name: '服务总览',
      description: null,
      layout: document.layout,
      config: document.config,
      created_by_user_id: 1,
      updated_by_user_id: 1,
      created_at: '2026-06-25T04:20:00Z',
      updated_at: '2026-06-25T04:20:00Z'
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(dashboard, 201))
      .mockResolvedValueOnce(jsonResponse(document));

    await expect(importDashboard(12, { document, name: '核心服务总览', description: undefined })).resolves.toEqual(dashboard);
    await expect(exportDashboard(12, 7)).resolves.toEqual(document);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:28117/api/v1/projects/12/dashboards/import',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          document,
          name: '核心服务总览'
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:28117/api/v1/projects/12/dashboards/7/export',
      expect.any(Object)
    );
  });

  it('panel 查询预览路径会编码 panel id 并携带 cookie 会话', async () => {
    const { previewDashboardPanel } = await loadDashboardClient();
    const response = {
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'error logs',
      title: 'Error logs',
      panel_type: 'logs',
      query: {},
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    await expect(previewDashboardPanel(12, 7, 'error logs')).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/projects/12/dashboards/7/panels/error%20logs/preview',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
  });

  it('panel 查询预览空 variables 不生成查询串且使用 cookie 会话', async () => {
    const { previewDashboardPanel } = await loadDashboardClient();
    const response = {
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'logs',
      title: 'Logs',
      panel_type: 'logs',
      query: {},
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    await expect(previewDashboardPanel(12, 7, 'logs', {})).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/projects/12/dashboards/7/panels/logs/preview',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
  });

  it('panel 查询预览 variables 会序列化为 URL encoded JSON 并使用 cookie 会话', async () => {
    const { previewDashboardPanel } = await loadDashboardClient();
    const response = {
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'logs',
      title: 'Logs',
      panel_type: 'logs',
      query: {},
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    await expect(previewDashboardPanel(12, 7, 'logs', { service_name: 'checkout api', sample_rate: 0.5 })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/projects/12/dashboards/7/panels/logs/preview?variables=%7B%22service_name%22%3A%22checkout+api%22%2C%22sample_rate%22%3A0.5%7D',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
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
