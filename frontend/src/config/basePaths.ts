export type AppRuntimeEnv = {
  readonly VITE_API_BASE_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_BASE_PATH?: string;
};

export function normalizePublicBasePath(value: string | undefined): string {
  return normalizePath(value, { fallback: '/', trailingSlash: true });
}

export function publicBasePathToRouterBasename(publicBasePath: string | undefined): string | undefined {
  const normalized = normalizePublicBasePath(publicBasePath);

  if (normalized === '/') {
    return undefined;
  }

  return normalized.replace(/\/$/, '');
}

export function resolveApiBaseUrl(env: AppRuntimeEnv): string {
  const explicitApiBaseUrl = normalizeBaseUrl(env.VITE_API_BASE_URL);

  if (explicitApiBaseUrl) {
    return explicitApiBaseUrl;
  }

  return normalizeApiBasePath(env.VITE_API_BASE_PATH);
}

export function normalizeApiBasePath(value: string | undefined): string {
  return normalizePath(value, { fallback: '', trailingSlash: false });
}

export function joinApiUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = normalizeRequestPath(path);
  const requestPath = normalizedBaseUrl.match(/\/api$/) ? normalizedPath.replace(/^\/api(?=\/|$)/, '') || '/' : normalizedPath;

  return `${normalizedBaseUrl}${requestPath}`;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function normalizeRequestPath(path: string): string {
  const normalizedPath = path.trim().replace(/^\/+/, '');
  return `/${normalizedPath}`;
}

function normalizePath(
  value: string | undefined,
  options: { fallback: string; trailingSlash: boolean }
): string {
  const trimmed = (value || '').trim();

  if (!trimmed || trimmed === '/') {
    return options.fallback;
  }

  const withoutDuplicateSlashes = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
  const normalized = `/${withoutDuplicateSlashes}`;

  return options.trailingSlash ? `${normalized}/` : normalized;
}
