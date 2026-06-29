import { appConfig } from './config';
import { joinApiUrl } from '../config/basePaths';

export type ApiClientOptions = {
  timeoutMs?: number;
};

export type ApiErrorPayload = {
  message: string;
  status?: number;
  details?: unknown;
};

export type ApiErrorDisplayContext = 'page' | 'form' | 'login';

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_DETAIL_MESSAGES = 3;
export const CSRF_COOKIE_NAME = 'telemetry.csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

const STATUS_MESSAGES: Record<ApiErrorDisplayContext, Partial<Record<number, string>>> = {
  page: {
    401: '登录状态已过期，请重新登录。',
    403: '当前账号无权访问该资源。',
    404: '接口或资源不存在，请确认后端基础管理接口已启用。',
    409: '资源状态冲突，请刷新后重试。',
    422: '请求参数未通过校验，请刷新页面后重试。',
    503: '服务暂时不可用，请稍后重试。'
  },
  form: {
    404: '关联资源不存在，请刷新列表后重试。',
    401: '登录状态已过期，请重新登录后重试。',
    403: '当前账号无权访问该资源。',
    409: '资源标识已存在或关联关系冲突，请调整后重试。',
    422: '表单字段未通过校验，请按提示修正。',
    503: '服务暂时不可用，请稍后重试。'
  },
  login: {
    401: '账号或密码不正确，请检查后重试。',
    403: '当前账号暂时无法登录，请联系管理员。',
    422: '账号或密码格式不正确，请检查后重试。'
  }
};

const STATUS_ONLY_MESSAGES = new Set<string>(['login:401']);

export class ApiClientError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.status = payload.status;
    this.details = payload.details;
  }
}

export async function apiRequest<TResponse>(
  path: string,
  init: RequestInit = {},
  options: ApiClientOptions = {}
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path), {
      ...init,
      headers: buildHeaders(init),
      credentials: init.credentials ?? 'include',
      signal: controller.signal
    });

    const body = await readBody(response);

    if (!response.ok) {
      throw new ApiClientError({
        message: extractErrorMessage(body, response.status),
        status: response.status,
        details: body
      });
    }

    return body as TResponse;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError({ message: '请求超时，请稍后重试。' });
    }

    if (error instanceof TypeError) {
      throw new ApiClientError({
        message: '网络连接失败，请检查网络或稍后重试。',
        details: error
      });
    }

    throw new ApiClientError({
      message: error instanceof Error ? error.message : '请求失败，请稍后重试。',
      details: error
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function formatApiErrorMessage(error: unknown, context: ApiErrorDisplayContext = 'page') {
  if (error instanceof ApiClientError) {
    const statusMessage = error.status ? STATUS_MESSAGES[context][error.status] : undefined;
    const detailMessage = readPayloadMessage(error.details);

    if (statusMessage && error.status && STATUS_ONLY_MESSAGES.has(`${context}:${error.status}`)) {
      return statusMessage;
    }

    if (statusMessage && detailMessage) {
      return `${statusMessage} ${detailMessage}`;
    }

    return statusMessage ?? detailMessage ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试。';
}

function buildUrl(path: string) {
  return joinApiUrl(appConfig.apiBaseUrl, path);
}

function buildHeaders(init: RequestInit): Record<string, string> {
  const requestMethod = normalizeMethod(init.method);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  };

  const csrfToken = shouldAttachCsrfHeader(requestMethod) ? readCookie(CSRF_COOKIE_NAME) : undefined;

  if (csrfToken) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }

  return {
    ...headers,
    ...normalizeHeaders(init.headers)
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

function normalizeMethod(method: string | undefined) {
  return (method || 'GET').trim().toUpperCase();
}

function shouldAttachCsrfHeader(method: string) {
  return CSRF_METHODS.has(method);
}

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const cookies = document.cookie ? document.cookie.split(';') : [];

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.split('=');

    if (rawName?.trim() === name) {
      const value = rawValue.join('=').trim();
      return value ? decodeURIComponent(value) : undefined;
    }
  }

  return undefined;
}

async function readBody(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (response.status === 204) {
    return null;
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function extractErrorMessage(body: unknown, status: number) {
  const message = readPayloadMessage(body);

  if (message) {
    return message;
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body.trim();
  }

  return `请求失败，HTTP 状态码 ${status}。`;
}

function readPayloadMessage(value: unknown): string | undefined {
  const text = readText(value);

  if (text) {
    return text;
  }

  return readMessage(value);
}

function readMessage(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as { detail?: unknown; error?: unknown; message?: unknown; msg?: unknown };
  return (
    readText(payload.message) ??
    readDetail(payload.detail, depth + 1) ??
    readText(payload.error) ??
    readText(payload.msg)
  );
}

function readDetail(detail: unknown, depth = 0): string | undefined {
  const text = readText(detail);

  if (text) {
    return text;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => readValidationError(item, depth + 1))
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.slice(0, MAX_DETAIL_MESSAGES).join('；') : undefined;
  }

  if (detail && typeof detail === 'object') {
    return readMessage(detail, depth + 1) ?? readObjectMessages(detail as Record<string, unknown>, depth + 1);
  }

  return undefined;
}

function readValidationError(value: unknown, depth = 0): string | undefined {
  const text = readText(value);

  if (text) {
    return text;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as { loc?: unknown; message?: unknown; msg?: unknown };
  const message = readText(payload.message) ?? readText(payload.msg) ?? readDetail(value, depth + 1);

  if (!message) {
    return undefined;
  }

  if (Array.isArray(payload.loc) && payload.loc.length > 0) {
    return `${payload.loc.join('.')}: ${message}`;
  }

  return message;
}

function readObjectMessages(value: Record<string, unknown>, depth = 0): string | undefined {
  if (depth > 3) {
    return undefined;
  }

  const messages = Object.entries(value)
    .map(([key, detail]) => {
      const message = readText(detail) ?? readDetail(detail, depth + 1);
      return message ? `${key}: ${message}` : undefined;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.slice(0, MAX_DETAIL_MESSAGES).join('；') : undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text.length > 0 ? text : undefined;
}
