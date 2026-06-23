import type { AuthUser } from '../../api/auth';
import { clearApiAuthToken, setApiAuthToken } from '../../api/http';
import type { AuthSession } from './authContext';

export const AUTH_SESSION_STORAGE_KEY = 'telemetry.auth.session.v1';

export function restoreStoredAuthSession(): AuthSession | null {
  const session = readStoredAuthSession();

  if (!session) {
    clearApiAuthToken();
    return null;
  }

  setApiAuthToken(session.accessToken, session.tokenType);
  return session;
}

export function readStoredAuthSession(): AuthSession | null {
  const storage = readSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    const value = JSON.parse(storage.getItem(AUTH_SESSION_STORAGE_KEY) || 'null') as Partial<AuthSession> | null;

    if (!value?.accessToken || typeof value.accessToken !== 'string') {
      return null;
    }

    return {
      accessToken: value.accessToken,
      tokenType: typeof value.tokenType === 'string' && value.tokenType.trim() ? value.tokenType : 'Bearer',
      user: isAuthUser(value.user) ? value.user : null
    };
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

export function writeStoredAuthSession(session: AuthSession) {
  const storage = readSessionStorage();

  if (!storage) {
    return;
  }

  storage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      user: session.user ?? null
    })
  );
}

export function clearStoredAuthSession() {
  readSessionStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function readSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  return Boolean(value && typeof value === 'object' && 'username' in value);
}
