import type { QueryClient } from '@tanstack/react-query';

export const ingestStatsQueryRootKey = ['ingest-stats'] as const;

export const ingestStatsQueryKeys = {
  overview: (sessionRevision: number) => [...ingestStatsQueryRootKey, 'overview', sessionRevision] as const
};

export function clearIngestStatsQueryCache(queryClient: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>) {
  void queryClient.cancelQueries({ queryKey: ingestStatsQueryRootKey });
  queryClient.removeQueries({ queryKey: ingestStatsQueryRootKey });
}
