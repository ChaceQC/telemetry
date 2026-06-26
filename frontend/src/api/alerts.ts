import { apiRequest } from './http';
import { buildQueryPath } from './queryParams';

export const ALERT_SIGNALS = ['metrics', 'logs', 'traces', 'events'] as const;
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AlertSignal = (typeof ALERT_SIGNALS)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type AlertRuleJson = Record<string, unknown>;

export type AlertRule = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  severity: AlertSeverity;
  signal: AlertSignal;
  condition: AlertRuleJson;
  evaluation: AlertRuleJson;
  created_by_user_id: number;
  updated_by_user_id: number;
  created_at: string;
  updated_at: string;
};

export type AlertRuleListParams = {
  project_id?: number;
  severity?: AlertSeverity;
  signal?: AlertSignal;
  enabled?: boolean;
  limit?: number;
  offset?: number;
};

export type AlertRuleListResponse = {
  items: AlertRule[];
  limit: number;
  offset: number;
  total: number;
};

export type CreateAlertRuleRequest = {
  project_id: number;
  name: string;
  description?: string | null;
  enabled?: boolean;
  severity: AlertSeverity;
  signal: AlertSignal;
  condition: AlertRuleJson;
  evaluation: AlertRuleJson;
};

export type UpdateAlertRuleRequest = Partial<
  Pick<CreateAlertRuleRequest, 'name' | 'description' | 'enabled' | 'severity' | 'signal' | 'condition' | 'evaluation'>
>;

export function listAlertRules(params: AlertRuleListParams = {}) {
  return apiRequest<AlertRuleListResponse>(
    buildQueryPath('/api/v1/alerts/rules', {
      project_id: params.project_id,
      severity: params.severity,
      signal: params.signal,
      enabled: params.enabled,
      limit: params.limit,
      offset: params.offset
    })
  );
}

export function createAlertRule(payload: CreateAlertRuleRequest) {
  return apiRequest<AlertRule>('/api/v1/alerts/rules', {
    method: 'POST',
    body: JSON.stringify(cleanAlertRulePayload(payload))
  });
}

export function getAlertRule(projectId: number, ruleId: number) {
  return apiRequest<AlertRule>(buildProjectAlertRulePath(projectId, ruleId));
}

export function updateAlertRule(projectId: number, ruleId: number, payload: UpdateAlertRuleRequest) {
  return apiRequest<AlertRule>(buildProjectAlertRulePath(projectId, ruleId), {
    method: 'PATCH',
    body: JSON.stringify(cleanAlertRulePayload(payload))
  });
}

export function deleteAlertRule(projectId: number, ruleId: number) {
  return apiRequest<null>(buildProjectAlertRulePath(projectId, ruleId), {
    method: 'DELETE'
  });
}

function buildProjectAlertRulePath(projectId: number, ruleId: number) {
  return `/api/v1/projects/${encodeURIComponent(`${projectId}`)}/alerts/rules/${encodeURIComponent(`${ruleId}`)}`;
}

function cleanAlertRulePayload<TPayload extends Record<string, unknown>>(payload: TPayload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
