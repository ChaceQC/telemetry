import { ApiClientError, formatApiErrorMessage } from '../../api/http';

export type SettingsAuthStatus = 'ready' | 'restoring' | 'signed-out' | 'unauthorized';

export type SettingsAuthState = {
  status: SettingsAuthStatus;
  shouldRequest: boolean;
  badgeLabel: string;
  title?: string;
  message?: string;
};

type SettingsAuthStateInput = {
  isAuthenticated: boolean;
  isRestoring: boolean;
  authError?: unknown;
};

export function resolveSettingsAuthState({
  isAuthenticated,
  isRestoring,
  authError
}: SettingsAuthStateInput): SettingsAuthState {
  if (isRestoring) {
    return {
      status: 'restoring',
      shouldRequest: false,
      badgeLabel: '确认登录',
      title: '正在确认登录状态',
      message: '正在读取当前会话，请稍候。'
    };
  }

  if (isUnauthorizedApiError(authError)) {
    return {
      status: 'unauthorized',
      shouldRequest: false,
      badgeLabel: '需要登录',
      title: '登录状态已过期',
      message: formatApiErrorMessage(authError, 'page')
    };
  }

  if (!isAuthenticated) {
    return {
      status: 'signed-out',
      shouldRequest: false,
      badgeLabel: '需要登录',
      title: '请先登录',
      message: '登录后可以管理项目、环境和服务。'
    };
  }

  return {
    status: 'ready',
    shouldRequest: true,
    badgeLabel: '已认证'
  };
}

export function findUnauthorizedApiError(errors: unknown[]) {
  return errors.find(isUnauthorizedApiError);
}

export function isUnauthorizedApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.status === 401;
}
