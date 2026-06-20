import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../api/http';
import { formatSessionErrorMessage, shouldClearSessionForAuthError } from './authErrors';

describe('auth session error handling', () => {
  it('仅在 401 认证失效时清理本地会话', () => {
    expect(shouldClearSessionForAuthError(new ApiClientError({ message: 'expired', status: 401 }))).toBe(true);
    expect(shouldClearSessionForAuthError(new ApiClientError({ message: 'forbidden', status: 403 }))).toBe(false);
    expect(shouldClearSessionForAuthError(new ApiClientError({ message: 'service unavailable', status: 503 }))).toBe(false);
    expect(shouldClearSessionForAuthError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('为非 401 恢复失败保留可展示错误文案', () => {
    expect(
      formatSessionErrorMessage(
        new ApiClientError({ message: 'forbidden', status: 403, details: { detail: '需要管理员权限。' } })
      )
    ).toBe('当前账号无权访问该资源。 需要管理员权限。');
  });
});
