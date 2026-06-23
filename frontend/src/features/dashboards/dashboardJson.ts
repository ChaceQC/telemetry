import type { Dashboard, DashboardJson } from '../../api/dashboards';

export const DEFAULT_DASHBOARD_LAYOUT = {
  version: 1,
  widgets: []
};

export const DEFAULT_DASHBOARD_CONFIG = {
  refresh_seconds: 30
};

export type DashboardJsonParseResult =
  | {
      ok: true;
      value: DashboardJson;
    }
  | {
      ok: false;
      message: string;
    };

export function parseDashboardJsonField(value: string, label: string): DashboardJsonParseResult {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!isDashboardJsonContainer(parsed)) {
      return {
        ok: false,
        message: `${label} 必须是 JSON 对象或数组。`
      };
    }

    return {
      ok: true,
      value: parsed
    };
  } catch {
    return {
      ok: false,
      message: `${label} 不是有效 JSON。`
    };
  }
}

export function formatDashboardJson(value: DashboardJson | undefined) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function createDefaultDashboardForm(projectId = '') {
  return {
    projectId,
    name: '',
    description: '',
    layoutText: formatDashboardJson(DEFAULT_DASHBOARD_LAYOUT),
    configText: formatDashboardJson(DEFAULT_DASHBOARD_CONFIG)
  };
}

export function dashboardToEditForm(dashboard: Dashboard | null) {
  return {
    dashboardId: dashboard?.id ?? null,
    name: dashboard?.name ?? '',
    description: dashboard?.description ?? '',
    layoutText: formatDashboardJson(dashboard?.layout),
    configText: formatDashboardJson(dashboard?.config)
  };
}

function isDashboardJsonContainer(value: unknown): value is DashboardJson {
  return Array.isArray(value) || (Boolean(value) && typeof value === 'object');
}
