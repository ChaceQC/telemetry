import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
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
});
