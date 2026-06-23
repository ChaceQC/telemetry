import { describe, expect, it } from 'vitest';
import { resolveCanRequestAuthenticatedApi } from './authContext';

describe('auth request gate', () => {
  it('仅在已认证且会话恢复完成后允许发起认证接口请求', () => {
    expect(resolveCanRequestAuthenticatedApi({ isAuthenticated: true, isRestoring: false })).toBe(true);
    expect(resolveCanRequestAuthenticatedApi({ isAuthenticated: true, isRestoring: true })).toBe(false);
    expect(resolveCanRequestAuthenticatedApi({ isAuthenticated: false, isRestoring: false })).toBe(false);
    expect(resolveCanRequestAuthenticatedApi({ isAuthenticated: false, isRestoring: true })).toBe(false);
  });
});
