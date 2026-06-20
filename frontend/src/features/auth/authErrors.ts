import { ApiClientError, formatApiErrorMessage } from '../../api/http';

export function shouldClearSessionForAuthError(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}

export function formatSessionErrorMessage(error: unknown) {
  return formatApiErrorMessage(error, 'page');
}
