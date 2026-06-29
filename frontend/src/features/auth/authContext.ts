import { createContext } from 'react';
import type { AuthUser, LoginRequest } from '../../api/auth';

export type AuthSession = {
  user?: AuthUser | null;
  isCookieSessionConfirmed: boolean;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  canRequestAuthenticatedApi: boolean;
  sessionRevision: number;
  sessionErrorMessage: string | null;
  login: (payload: LoginRequest) => Promise<AuthUser | null>;
  logout: () => void;
  refreshCurrentUser: () => Promise<AuthUser | null>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function resolveCanRequestAuthenticatedApi(auth: Pick<AuthContextValue, 'isAuthenticated' | 'isRestoring'>) {
  return auth.isAuthenticated && !auth.isRestoring;
}
