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
  sessionRevision: number;
  sessionErrorMessage: string | null;
  login: (payload: LoginRequest) => Promise<AuthUser | null>;
  logout: () => void;
  refreshCurrentUser: () => Promise<AuthUser | null>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
