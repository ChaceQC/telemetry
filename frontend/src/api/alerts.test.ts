import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAlertClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('./alerts');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('alert rules api client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('列表请求携带项目、severity、signal、enabled、分页和 cookie 会话', async () => {
    const { listAlertRules } = await loadAlertClient();
    const response = { items: [], limit: 25, offset: 50, total: 0 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response));

    await expect(
      listAlertRules({
        project_id: 12,
        severity: 'critical',
        signal: 'metrics',
        enabled: false,
        limit: 25,
        offset: 50
      })
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/alerts/rules?project_id=12&severity=critical&signal=metrics&enabled=false&limit=25&offset=50',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
  });

  it('创建请求保留 description=null、enabled=false 和 JSON 对象', async () => {
    const { createAlertRule } = await loadAlertClient();
    const response = createAlertRuleFixture({ enabled: false, description: null });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(response, 201));

    await expect(
      createAlertRule({
        project_id: 12,
        name: 'HTTP 5xx rate',
        description: null,
        enabled: false,
        severity: 'critical',
        signal: 'metrics',
        condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
        evaluation: { window_seconds: 300, interval_seconds: 60 }
      })
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/alerts/rules',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          project_id: 12,
          name: 'HTTP 5xx rate',
          description: null,
          enabled: false,
          severity: 'critical',
          signal: 'metrics',
          condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
          evaluation: { window_seconds: 300, interval_seconds: 60 }
        })
      })
    );
  });

  it('读取、更新和删除使用项目边界路径', async () => {
    const { getAlertRule, updateAlertRule, deleteAlertRule } = await loadAlertClient();
    const rule = createAlertRuleFixture();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(rule))
      .mockResolvedValueOnce(jsonResponse({ ...rule, enabled: false }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(getAlertRule(12, 7)).resolves.toEqual(rule);
    await expect(updateAlertRule(12, 7, { enabled: false, description: null })).resolves.toEqual({ ...rule, enabled: false });
    await expect(deleteAlertRule(12, 7)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:28117/api/v1/projects/12/alerts/rules/7', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:28117/api/v1/projects/12/alerts/rules/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          enabled: false,
          description: null
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:28117/api/v1/projects/12/alerts/rules/7',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });

  it('空列表参数不生成查询串', async () => {
    const { listAlertRules } = await loadAlertClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], limit: 50, offset: 0, total: 0 }));

    await listAlertRules({ project_id: undefined, severity: undefined, signal: undefined, enabled: undefined });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:28117/api/v1/alerts/rules', expect.any(Object));
  });
});

function createAlertRuleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    project_id: 12,
    name: 'HTTP 5xx rate',
    description: '5 分钟错误率过高',
    enabled: true,
    severity: 'critical',
    signal: 'metrics',
    condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
    evaluation: { window_seconds: 300, interval_seconds: 60 },
    created_by_user_id: 1,
    updated_by_user_id: 1,
    created_at: '2026-06-26T12:00:00Z',
    updated_at: '2026-06-26T12:00:00Z',
    ...overrides
  };
}
