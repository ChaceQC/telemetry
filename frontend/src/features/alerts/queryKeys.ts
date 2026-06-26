import type { QueryClient } from '@tanstack/react-query';
import type { AlertRuleListParams } from '../../api/alerts';

export const alertRuleQueryRootKey = ['alerts', 'rules'] as const;

export const alertRuleQueryKeys = {
  list: (sessionRevision: number, params: AlertRuleListParams) =>
    [...alertRuleQueryRootKey, 'list', sessionRevision, params] as const,
  detail: (sessionRevision: number, projectId: number, ruleId: number) =>
    [...alertRuleQueryRootKey, 'detail', sessionRevision, projectId, ruleId] as const
};

export function clearAlertRuleQueryCache(queryClient: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>) {
  void queryClient.cancelQueries({ queryKey: alertRuleQueryRootKey });
  queryClient.removeQueries({ queryKey: alertRuleQueryRootKey });
}
