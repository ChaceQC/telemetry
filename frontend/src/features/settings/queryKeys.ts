import type { QueryClient } from '@tanstack/react-query';

export const settingsQueryRootKey = ['settings'] as const;

export const settingsQueryKeys = {
  projects: [...settingsQueryRootKey, 'projects'] as const,
  projectList: (sessionRevision: number) => [...settingsQueryRootKey, 'projects', sessionRevision] as const,
  environments: [...settingsQueryRootKey, 'environments'] as const,
  environmentList: (sessionRevision: number) => [...settingsQueryRootKey, 'environments', sessionRevision] as const,
  services: [...settingsQueryRootKey, 'services'] as const,
  serviceList: (sessionRevision: number) => [...settingsQueryRootKey, 'services', sessionRevision] as const
};

export function clearSettingsQueryCache(queryClient: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>) {
  void queryClient.cancelQueries({ queryKey: settingsQueryRootKey });
  queryClient.removeQueries({ queryKey: settingsQueryRootKey });
}
