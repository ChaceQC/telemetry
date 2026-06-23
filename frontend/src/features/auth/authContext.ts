import { createContext } from 'react';
import type { AuthUser, LoginRequest } from '../../api/auth';

export type AuthSession = {
  accessToken: string;
  tokenType: string;
  user?: AuthUser | null;
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
