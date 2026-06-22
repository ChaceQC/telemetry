import type { QueryClient } from '@tanstack/react-query';

export const telemetryQueryRootKey = ['query'] as const;

export function buildSignalQueryKey(sessionRevision: number, signal: string, params: unknown, version: number) {
  return [...telemetryQueryRootKey, sessionRevision, signal, params, version] as const;
}

export function buildLogContextQueryKey(
  sessionRevision: number,
  logId: number | string,
  before: number,
  after: number
) {
  return [...telemetryQueryRootKey, sessionRevision, 'logs', 'context', logId, before, after] as const;
}

export function resolveVisibleQueryData<TData>(canQuery: boolean, data: TData | undefined) {
  return canQuery ? data : undefined;
}

export function shouldRenderLogContextPanel(canQuery: boolean, isExpanded: boolean) {
  return canQuery && isExpanded;
}

export function clearTelemetryQueryCache(queryClient: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>) {
  void queryClient.cancelQueries({ queryKey: telemetryQueryRootKey });
  queryClient.removeQueries({ queryKey: telemetryQueryRootKey });
}
