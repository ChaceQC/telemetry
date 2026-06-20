import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getCurrentUser, login } from '../../api/auth';
import type { AuthUser, LoginRequest } from '../../api/auth';
import { clearApiAuthToken, setApiAuthToken } from '../../api/http';
import { AuthContext } from './authContext';
import type { AuthContextValue, AuthSession } from './authContext';
import { formatSessionErrorMessage, shouldClearSessionForAuthError } from './authErrors';

const AUTH_SESSION_STORAGE_KEY = 'telemetry.auth.session.v1';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);
  const isRestoring = Boolean(session && !session.user && !sessionErrorMessage);

  useEffect(() => {
    if (session) {
      setApiAuthToken(session.accessToken, session.tokenType);
      writeStoredSession(session);
      return;
    }

    clearApiAuthToken();
    clearStoredSession();
  }, [session]);

  const logout = useCallback(() => {
    setSessionErrorMessage(null);
    setSession(null);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!session) {
      return null;
    }

    try {
      const currentUser = await getCurrentUser();
      setSessionErrorMessage(null);
      setSession((currentSession) => (currentSession ? { ...currentSession, user: currentUser } : currentSession));
      return currentUser;
    } catch (error) {
      if (shouldClearSessionForAuthError(error)) {
        logout();
      } else {
        setSessionErrorMessage(formatSessionErrorMessage(error));
      }
      throw error;
    }
  }, [logout, session]);

  useEffect(() => {
    if (!session || session.user) {
      return;
    }

    let ignore = false;

    getCurrentUser()
      .then((currentUser) => {
        if (!ignore) {
          setSessionErrorMessage(null);
          setSession((currentSession) => (currentSession ? { ...currentSession, user: currentUser } : currentSession));
        }
      })
      .catch((error: unknown) => {
        if (ignore) {
          return;
        }

        if (shouldClearSessionForAuthError(error)) {
          logout();
          return;
        }

        setSessionErrorMessage(formatSessionErrorMessage(error));
      });

    return () => {
      ignore = true;
    };
  }, [logout, session]);

  const loginWithPassword = useCallback(async (payload: LoginRequest) => {
    const response = await login(payload);
    const nextSession: AuthSession = {
      accessToken: response.access_token,
      tokenType: response.token_type || 'Bearer',
      user: response.user ?? null
    };

    setSessionErrorMessage(null);
    setSession(nextSession);
    return nextSession.user ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.accessToken),
      isRestoring,
      sessionErrorMessage,
      login: loginWithPassword,
      logout,
      refreshCurrentUser
    }),
    [isRestoring, loginWithPassword, logout, refreshCurrentUser, session, sessionErrorMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function readStoredSession(): AuthSession | null {
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
    clearStoredSession();
    return null;
  }
}

function writeStoredSession(session: AuthSession) {
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

function clearStoredSession() {
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
