import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('./http');
}

async function loadApiClientWithEnv(env: { VITE_API_BASE_PATH?: string; VITE_API_BASE_URL?: string }) {
  vi.resetModules();

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  return import('./http');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('使用 VITE_API_BASE_URL 拼接请求地址', async () => {
    const { apiRequest } = await loadApiClient('http://localhost:28117/');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'ok' }));

    await apiRequest('health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json'
        }),
        credentials: 'include'
      })
    );
  });

  it('未配置 VITE_API_BASE_URL 时使用同源 API 前缀', async () => {
    const { apiRequest } = await loadApiClientWithEnv({
      VITE_API_BASE_URL: '',
      VITE_API_BASE_PATH: '/xxx/api/'
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'ok' }));

    await apiRequest('/api/v1/projects');

    expect(fetchMock).toHaveBeenCalledWith(
      '/xxx/api/v1/projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json'
        }),
        credentials: 'include'
      })
    );
  });

  it('非 GET/HEAD/OPTIONS 请求从 CSRF cookie 自动附加 X-CSRF-Token', async () => {
    const { apiRequest, CSRF_HEADER_NAME } = await loadApiClient();
    vi.stubGlobal('document', {
      cookie: 'telemetry.csrf=csrf%2Fvalue; other=value'
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 1 }));

    await apiRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Core' })
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/projects',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          [CSRF_HEADER_NAME]: 'csrf/value'
        })
      })
    );
  });

  it('GET 请求不附加 CSRF header', async () => {
    const { apiRequest, CSRF_HEADER_NAME } = await loadApiClient();
    vi.stubGlobal('document', {
      cookie: 'telemetry.csrf=csrf-value'
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: 'ok' }));

    await apiRequest('/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/health',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({
          [CSRF_HEADER_NAME]: expect.any(String)
        })
      })
    );
  });

  it('兼容 FastAPI detail 字符串错误', async () => {
    const { apiRequest } = await loadApiClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ detail: '请求参数无效。' }, 422));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: '请求参数无效。',
      status: 422,
      details: { detail: '请求参数无效。' }
    });
  });

  it('兼容 FastAPI detail 校验错误数组', async () => {
    const { apiRequest } = await loadApiClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          detail: [{ loc: ['body', 'service'], msg: 'Field required', type: 'missing' }]
        },
        422
      )
    );

    await expect(apiRequest('/health')).rejects.toMatchObject({
      message: 'body.service: Field required',
      status: 422
    });
  });

  it('兼容 FastAPI detail 对象错误', async () => {
    const { apiRequest } = await loadApiClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          detail: {
            key: '已存在。',
            environment_id: '必须引用已存在环境。'
          }
        },
        409
      )
    );

    await expect(apiRequest('/api/v1/services')).rejects.toMatchObject({
      message: 'key: 已存在。；environment_id: 必须引用已存在环境。',
      status: 409
    });
  });

  it('按表单上下文展示 404、409、422 错误', async () => {
    const { ApiClientError, formatApiErrorMessage } = await loadApiClient();

    expect(
      formatApiErrorMessage(new ApiClientError({ message: 'not found', status: 404, details: { detail: '项目不存在。' } }), 'form')
    ).toBe('关联资源不存在，请刷新列表后重试。 项目不存在。');
    expect(
      formatApiErrorMessage(new ApiClientError({ message: 'conflict', status: 409, details: { detail: '服务 key 已存在。' } }), 'form')
    ).toBe('资源标识已存在或关联关系冲突，请调整后重试。 服务 key 已存在。');
    expect(
      formatApiErrorMessage(
        new ApiClientError({
          message: 'invalid',
          status: 422,
          details: { detail: [{ loc: ['body', 'key'], msg: 'String should match pattern' }] }
        }),
        'form'
      )
    ).toBe('表单字段未通过校验，请按提示修正。 body.key: String should match pattern');
  });

  it('区分登录表单和普通表单的 401 错误文案', async () => {
    const { ApiClientError, formatApiErrorMessage } = await loadApiClient();
    const error = new ApiClientError({ message: 'unauthorized', status: 401, details: { detail: 'Invalid token' } });

    expect(formatApiErrorMessage(error, 'login')).toBe('账号或密码不正确，请检查后重试。');
    expect(formatApiErrorMessage(error, 'form')).toBe('登录状态已过期，请重新登录后重试。 Invalid token');
    expect(formatApiErrorMessage(error, 'page')).toBe('登录状态已过期，请重新登录。 Invalid token');
  });

  it('按页面上下文展示列表读取错误', async () => {
    const { ApiClientError, formatApiErrorMessage } = await loadApiClient();

    expect(
      formatApiErrorMessage(
        new ApiClientError({ message: 'missing', status: 404, details: { detail: '接口不存在。' } }),
        'page'
      )
    ).toBe('接口或资源不存在，请确认后端基础管理接口已启用。 接口不存在。');
  });

  it('认证主路径使用 cookie，不自动注入 Authorization', async () => {
    const { apiRequest } = await loadApiClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ id: 1 })));

    await apiRequest('/api/v1/auth/me');

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:28117/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        }),
        credentials: 'include'
      })
    );
  });

  it('登录请求也不自动注入 Authorization', async () => {
    const { apiRequest } = await loadApiClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

    await apiRequest('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({}) });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/auth/login',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        }),
        credentials: 'include'
      })
    );
  });

  it('请求超时时返回统一错误', async () => {
    vi.useFakeTimers();
    const { apiRequest } = await loadApiClient();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('请求已取消', 'AbortError')));
      });
    });

    const request = expect(apiRequest('/slow', {}, { timeoutMs: 25 })).rejects.toMatchObject({
      name: 'ApiClientError',
      message: '请求超时，请稍后重试。'
    });
    await vi.advanceTimersByTimeAsync(25);
    await request;
  });

  it('网络连接失败时返回统一中文错误', async () => {
    const { apiRequest } = await loadApiClient();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: '网络连接失败，请检查网络或稍后重试。'
    });
  });
});
