import { describe, expect, it } from 'vitest';
import { ApiClientError, formatApiErrorMessage } from '../../api/http';
import { findUnauthorizedApiError, resolveSettingsAuthState } from './authState';

describe('settings auth state', () => {
  it('未登录时阻止基础管理请求并展示页面级登录入口', () => {
    expect(resolveSettingsAuthState({ isAuthenticated: false, isRestoring: false })).toMatchObject({
      status: 'signed-out',
      shouldRequest: false,
      badgeLabel: '需要登录',
      title: '请先登录',
      message: '登录后可以管理项目、环境和服务。'
    });
  });

  it('恢复 session 时暂缓请求，避免空 token 管理接口调用', () => {
    expect(resolveSettingsAuthState({ isAuthenticated: true, isRestoring: true })).toMatchObject({
      status: 'restoring',
      shouldRequest: false,
      badgeLabel: '确认登录'
    });
  });

  it('有认证状态时允许 Settings 基础管理接口请求', () => {
    expect(resolveSettingsAuthState({ isAuthenticated: true, isRestoring: false })).toMatchObject({
      status: 'ready',
      shouldRequest: true,
      badgeLabel: '已认证'
    });
  });

  it('401 使用页面级登录过期提示，不显示账号密码错误', () => {
    const error = new ApiClientError({
      message: 'invalid token',
      status: 401,
      details: { detail: 'Invalid token' }
    });

    const state = resolveSettingsAuthState({
      isAuthenticated: true,
      isRestoring: false,
      authError: error
    });

    expect(state).toMatchObject({
      status: 'unauthorized',
      shouldRequest: false,
      badgeLabel: '需要登录',
      title: '登录状态已过期',
      message: '登录状态已过期，请重新登录。 Invalid token'
    });
    expect(state.message).not.toContain('账号或密码不正确');
    expect(formatApiErrorMessage(error, 'login')).toBe('账号或密码不正确，请检查后重试。');
  });

  it('从列表或表单错误集合中识别 401', () => {
    const forbiddenError = new ApiClientError({ message: 'forbidden', status: 403 });
    const unauthorizedError = new ApiClientError({ message: 'expired', status: 401 });

    expect(findUnauthorizedApiError([null, forbiddenError, unauthorizedError])).toBe(unauthorizedError);
  });
});
