import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getCurrentUser, login, logoutSession } from '../../api/auth';
import type { LoginRequest } from '../../api/auth';
import { clearAlertRuleQueryCache } from '../alerts/queryKeys';
import { clearDashboardQueryCache } from '../dashboards/queryKeys';
import { clearIngestStatsQueryCache } from '../overview/queryKeys';
import { clearTelemetryQueryCache } from '../query/querySession';
import { clearSettingsQueryCache } from '../settings/queryKeys';
import { AuthContext } from './authContext';
import { resolveCanRequestAuthenticatedApi, type AuthContextValue, type AuthSession } from './authContext';
import { formatSessionErrorMessage, shouldClearSessionForAuthError } from './authErrors';
import { clearStoredAuthSession, restoreStoredAuthSession, writeStoredAuthSession } from './authSession';

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(() => restoreStoredAuthSession() ?? createPendingCookieSession());
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);
  const isRestoring = Boolean(session && !session.isCookieSessionConfirmed && !sessionErrorMessage);
  const isAuthenticated = Boolean(session?.isCookieSessionConfirmed);
  const canRequestAuthenticatedApi = resolveCanRequestAuthenticatedApi({ isAuthenticated, isRestoring });

  useEffect(() => {
    if (session) {
      if (session.isCookieSessionConfirmed) {
        writeStoredAuthSession(session);
      }
      return;
    }

    clearStoredAuthSession();
  }, [session]);

  const clearLocalSession = useCallback(() => {
    clearAuthenticatedQueryCaches(queryClient);
    setSessionRevision((current) => current + 1);
    setSessionErrorMessage(null);
    setSession(null);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } finally {
      clearLocalSession();
    }
  }, [clearLocalSession]);

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
      setSession((currentSession) =>
        currentSession ? { ...currentSession, user: currentUser, isCookieSessionConfirmed: true } : currentSession
      );
      return currentUser;
    } catch (error) {
      if (shouldClearSessionForAuthError(error)) {
        clearLocalSession();
      } else {
        setSessionErrorMessage(formatSessionErrorMessage(error));
      }
      throw error;
    }
  }, [clearLocalSession, queryClient, session]);

  useEffect(() => {
    if (!session || session.isCookieSessionConfirmed || sessionErrorMessage) {
      return;
    }

    let ignore = false;

    getCurrentUser()
      .then((currentUser) => {
        if (!ignore) {
          clearAuthenticatedQueryCaches(queryClient);
          setSessionRevision((current) => current + 1);
          setSessionErrorMessage(null);
          setSession((currentSession) =>
            currentSession ? { ...currentSession, user: currentUser, isCookieSessionConfirmed: true } : currentSession
          );
        }
      })
      .catch((error: unknown) => {
        if (ignore) {
          return;
        }

        if (shouldClearSessionForAuthError(error)) {
          clearLocalSession();
          return;
        }

        setSessionErrorMessage(formatSessionErrorMessage(error));
      });

    return () => {
      ignore = true;
    };
  }, [clearLocalSession, queryClient, session, sessionErrorMessage]);

  const loginWithPassword = useCallback(async (payload: LoginRequest) => {
    const response = await login(payload);
    const currentUser = response.user ?? (await getCurrentUser());
    const nextSession: AuthSession = {
      user: currentUser,
      isCookieSessionConfirmed: true
    };

    clearAuthenticatedQueryCaches(queryClient);
    setSessionRevision((current) => current + 1);
    setSessionErrorMessage(null);
    setSession(nextSession);
    return currentUser;
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: isAuthenticated ? (session?.user ?? null) : null,
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
  clearDashboardQueryCache(queryClient);
  clearAlertRuleQueryCache(queryClient);
}

function createPendingCookieSession(): AuthSession {
  return {
    user: null,
    isCookieSessionConfirmed: false
  };
}
