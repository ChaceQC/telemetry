import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAuthClient(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  return import('./auth');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('auth api client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('调用登录接口并提交账号密码', async () => {
    const { login } = await loadAuthClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        access_token: 'token-value',
        token_type: 'Bearer'
      })
    );

    await expect(login({ username: 'admin', password: 'secret' })).resolves.toMatchObject({
      access_token: 'token-value',
      token_type: 'Bearer'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'secret' }),
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('调用当前用户接口', async () => {
    const { getCurrentUser } = await loadAuthClient();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 1,
        username: 'admin',
        roles: ['owner']
      })
    );

    await expect(getCurrentUser()).resolves.toMatchObject({
      username: 'admin',
      roles: ['owner']
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json'
        })
      })
    );
  });
});
