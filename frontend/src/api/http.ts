import { appConfig } from './config';

export type ApiClientOptions = {
  timeoutMs?: number;
};

export type ApiErrorPayload = {
  message: string;
  status?: number;
  details?: unknown;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_DETAIL_MESSAGES = 3;

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
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      },
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

    throw new ApiClientError({
      message: error instanceof Error ? error.message : '请求失败，请稍后重试。',
      details: error
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function buildUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${appConfig.apiBaseUrl}${normalizedPath}`;
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
  const message = readMessage(body);

  if (message) {
    return message;
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body.trim();
  }

  return `请求失败，HTTP 状态码 ${status}。`;
}

function readMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as { detail?: unknown; error?: unknown; message?: unknown; msg?: unknown };
  return readText(payload.message) ?? readDetail(payload.detail) ?? readText(payload.error) ?? readText(payload.msg);
}

function readDetail(detail: unknown): string | undefined {
  const text = readText(detail);

  if (text) {
    return text;
  }

  if (Array.isArray(detail)) {
    const messages = detail.map(readValidationError).filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.slice(0, MAX_DETAIL_MESSAGES).join('；') : undefined;
  }

  return readMessage(detail);
}

function readValidationError(value: unknown): string | undefined {
  const text = readText(value);

  if (text) {
    return text;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const payload = value as { loc?: unknown; message?: unknown; msg?: unknown };
  const message = readText(payload.message) ?? readText(payload.msg);

  if (!message) {
    return undefined;
  }

  if (Array.isArray(payload.loc) && payload.loc.length > 0) {
    return `${payload.loc.join('.')}: ${message}`;
  }

  return message;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text.length > 0 ? text : undefined;
}
