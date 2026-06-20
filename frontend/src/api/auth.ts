import { apiRequest } from './http';

export type AuthUser = {
  id: number | string;
  username: string;
  display_name?: string | null;
  email?: string | null;
  roles?: string[];
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  user?: AuthUser;
};

export function login(payload: LoginRequest) {
  return apiRequest<LoginResponse>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    {
      auth: false
    }
  );
}

export function getCurrentUser() {
  return apiRequest<AuthUser>('/api/v1/auth/me');
}
