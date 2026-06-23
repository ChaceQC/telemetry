import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from './authContext';
import { AUTH_SESSION_STORAGE_KEY } from './authSession';

type SessionStorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

async function loadSessionAndQueryModules(apiBaseUrl = 'http://localhost:28117/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  const [session, query, http] = await Promise.all([import('./authSession'), import('../../api/query'), import('../../api/http')]);
  return { ...session, ...query, ...http };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function createMemorySessionStorage(): SessionStorageLike {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    })
  };
}

function installSessionStorage(initialSession?: Partial<AuthSession>) {
  const storage = createMemorySessionStorage();

  if (initialSession) {
    storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(initialSession));
  }

  vi.stubGlobal('window', {
    sessionStorage: storage
  });

  return storage;
}

describe('auth session hydration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('恢复本地 session 时同步注入 API token，logs 初始查询首包携带 Authorization', async () => {
    installSessionStorage({
      accessToken: 'stored-token',
      tokenType: 'Bearer',
      user: {
        id: 1,
        username: 'operator',
        display_name: 'Operator',
        email: null,
        roles: []
      }
    });
    const { restoreStoredAuthSession, listLogs } = await loadSessionAndQueryModules();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    const session = restoreStoredAuthSession();
    await listLogs({ trace_id: 'trace-url', span_id: 'span-url', limit: 100 });

    expect(session).toMatchObject({ accessToken: 'stored-token' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/logs?trace_id=trace-url&span_id=span-url&limit=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stored-token'
        })
      })
    );
  });

  it('恢复本地 session 后 traces URL 初始查询首包携带 Authorization', async () => {
    installSessionStorage({
      accessToken: 'trace-token',
      tokenType: 'Token'
    });
    const { restoreStoredAuthSession, listTraces } = await loadSessionAndQueryModules();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    restoreStoredAuthSession();
    await listTraces({ trace_id: 'trace-url', limit: 100 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/traces?trace_id=trace-url&limit=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Token trace-token'
        })
      })
    );
  });

  it('本地 session 缺失时清理 API token，避免未登录首屏误发旧 Authorization', async () => {
    installSessionStorage();
    const { restoreStoredAuthSession, listLogs, setApiAuthToken } = await loadSessionAndQueryModules();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [], next_cursor: null }));

    setApiAuthToken('stale-token');
    const session = restoreStoredAuthSession();
    await listLogs({ trace_id: 'trace-url', limit: 100 });

    expect(session).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:28117/api/v1/query/logs?trace_id=trace-url&limit=100',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String)
        })
      })
    );
  });
});
