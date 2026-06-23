import { apiRequest } from './http';
import { buildQueryPath } from './queryParams';

export type DashboardJson = Record<string, unknown> | unknown[];

export type Dashboard = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  layout: DashboardJson;
  config: DashboardJson;
  created_by_user_id: number;
  updated_by_user_id: number;
  created_at: string;
  updated_at: string;
};

export type DashboardListParams = {
  project_id?: number;
  limit?: number;
  offset?: number;
};

export type DashboardListResponse = {
  items: Dashboard[];
  limit: number;
  offset: number;
  total: number;
};

export type CreateDashboardRequest = {
  project_id: number;
  name: string;
  description?: string | null;
  layout?: DashboardJson;
  config?: DashboardJson;
};

export type UpdateDashboardRequest = {
  name?: string;
  description?: string | null;
  layout?: DashboardJson;
  config?: DashboardJson;
};

export function listDashboards(params: DashboardListParams = {}) {
  return apiRequest<DashboardListResponse>(
    buildQueryPath('/api/v1/dashboards', {
      project_id: params.project_id,
      limit: params.limit,
      offset: params.offset
    })
  );
}

export function createDashboard(payload: CreateDashboardRequest) {
  return apiRequest<Dashboard>('/api/v1/dashboards', {
    method: 'POST',
    body: JSON.stringify(cleanDashboardPayload(payload))
  });
}

export function getDashboard(projectId: number, dashboardId: number) {
  return apiRequest<Dashboard>(buildProjectDashboardPath(projectId, dashboardId));
}

export function updateDashboard(projectId: number, dashboardId: number, payload: UpdateDashboardRequest) {
  return apiRequest<Dashboard>(buildProjectDashboardPath(projectId, dashboardId), {
    method: 'PATCH',
    body: JSON.stringify(cleanDashboardPayload(payload))
  });
}

export function deleteDashboard(projectId: number, dashboardId: number) {
  return apiRequest<null>(buildProjectDashboardPath(projectId, dashboardId), {
    method: 'DELETE'
  });
}

function buildProjectDashboardPath(projectId: number, dashboardId: number) {
  return `/api/v1/projects/${encodeURIComponent(`${projectId}`)}/dashboards/${encodeURIComponent(`${dashboardId}`)}`;
}

function cleanDashboardPayload<TPayload extends Record<string, unknown>>(payload: TPayload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
