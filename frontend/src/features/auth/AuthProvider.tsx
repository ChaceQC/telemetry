import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getCurrentUser, login } from '../../api/auth';
import type { LoginRequest } from '../../api/auth';
import { clearApiAuthToken, setApiAuthToken } from '../../api/http';
import { clearIngestStatsQueryCache } from '../overview/queryKeys';
import { clearTelemetryQueryCache } from '../query/querySession';
import { clearSettingsQueryCache } from '../settings/queryKeys';
import { AuthContext } from './authContext';
import { resolveCanRequestAuthenticatedApi, type AuthContextValue, type AuthSession } from './authContext';
import { formatSessionErrorMessage, shouldClearSessionForAuthError } from './authErrors';
import { clearStoredAuthSession, restoreStoredAuthSession, writeStoredAuthSession } from './authSession';

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(() => restoreStoredAuthSession());
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);
  const isRestoring = Boolean(session && !session.user && !sessionErrorMessage);
  const isAuthenticated = Boolean(session?.accessToken);
  const canRequestAuthenticatedApi = resolveCanRequestAuthenticatedApi({ isAuthenticated, isRestoring });

  useEffect(() => {
    if (session) {
      setApiAuthToken(session.accessToken, session.tokenType);
      writeStoredAuthSession(session);
      return;
    }

    clearApiAuthToken();
    clearStoredAuthSession();
  }, [session]);

  const logout = useCallback(() => {
    clearAuthenticatedQueryCaches(queryClient);
    clearApiAuthToken();
    setSessionRevision((current) => current + 1);
    setSessionErrorMessage(null);
    setSession(null);
  }, [queryClient]);

  const refreshCurrentUser = useCallback(async () => {
    if (!session) {
      return null;
    }

    try {
      const currentUser = await getCurrentUser();
      if (!session.user) {
        clearAuthenticatedQueryCaches(queryClient);
        setSessionRevision((current) => current + 1);
      }
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
  }, [logout, queryClient, session]);

  useEffect(() => {
    if (!session || session.user) {
      return;
    }

    let ignore = false;

    getCurrentUser()
      .then((currentUser) => {
        if (!ignore) {
          clearAuthenticatedQueryCaches(queryClient);
          setSessionRevision((current) => current + 1);
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
  }, [logout, queryClient, session]);

  const loginWithPassword = useCallback(async (payload: LoginRequest) => {
    const response = await login(payload);
    const nextSession: AuthSession = {
      accessToken: response.access_token,
      tokenType: response.token_type || 'Bearer',
      user: response.user ?? null
    };

    clearAuthenticatedQueryCaches(queryClient);
    setApiAuthToken(nextSession.accessToken, nextSession.tokenType);
    setSessionRevision((current) => current + 1);
    setSessionErrorMessage(null);
    setSession(nextSession);
    return nextSession.user ?? null;
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated,
      isRestoring,
      canRequestAuthenticatedApi,
      sessionRevision,
      sessionErrorMessage,
      login: loginWithPassword,
      logout,
      refreshCurrentUser
    }),
    [
      canRequestAuthenticatedApi,
      isAuthenticated,
      isRestoring,
      loginWithPassword,
      logout,
      refreshCurrentUser,
      session,
      sessionErrorMessage,
      sessionRevision
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function clearAuthenticatedQueryCaches(queryClient: Parameters<typeof clearTelemetryQueryCache>[0]) {
  clearTelemetryQueryCache(queryClient);
  clearSettingsQueryCache(queryClient);
  clearIngestStatsQueryCache(queryClient);
}
