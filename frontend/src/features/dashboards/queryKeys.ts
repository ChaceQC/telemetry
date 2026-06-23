import type { QueryClient } from '@tanstack/react-query';
import type { DashboardListParams } from '../../api/dashboards';

export const dashboardQueryRootKey = ['dashboards'] as const;

export const dashboardQueryKeys = {
  list: (sessionRevision: number, params: DashboardListParams) =>
    [...dashboardQueryRootKey, 'list', sessionRevision, params] as const,
  panelPreview: (sessionRevision: number, projectId: number, dashboardId: number, panelId: string) =>
    [...dashboardQueryRootKey, 'panelPreview', sessionRevision, projectId, dashboardId, panelId] as const
};

export function clearDashboardQueryCache(queryClient: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>) {
  void queryClient.cancelQueries({ queryKey: dashboardQueryRootKey });
  queryClient.removeQueries({ queryKey: dashboardQueryRootKey });
}
