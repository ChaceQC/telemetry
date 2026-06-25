import { updateDashboard, type CreateDashboardFromTemplateRequest, type Dashboard } from '../../api/dashboards';
import { parseDashboardJsonField } from './dashboardJson';

export function buildDashboardPayload(input: {
  projectId: number;
  name: string;
  description: string;
  layoutText: string;
  configText: string;
}) {
  const layout = parseDashboardJsonField(input.layoutText, 'layout');
  if (!layout.ok) {
    return layout;
  }

  const config = parseDashboardJsonField(input.configText, 'config');
  if (!config.ok) {
    return config;
  }

  return {
    ok: true as const,
    value: {
      project_id: input.projectId,
      name: input.name,
      description: normalizeOptionalText(input.description),
      layout: layout.value,
      config: config.value
    }
  };
}

export function buildDashboardPatchPayload(
  dashboard: Dashboard,
  form: {
    name: string;
    description: string;
    layoutText: string;
    configText: string;
  }
) {
  const layout = parseDashboardJsonField(form.layoutText, 'layout');
  if (!layout.ok) {
    return layout;
  }

  const config = parseDashboardJsonField(form.configText, 'config');
  if (!config.ok) {
    return config;
  }

  const payload = {
    name: form.name,
    description: normalizeOptionalText(form.description),
    layout: layout.value,
    config: config.value
  };

  const currentDescription = normalizeOptionalText(dashboard.description ?? '');
  const changedPayload: Parameters<typeof updateDashboard>[2] = {};

  if (payload.name !== dashboard.name) {
    changedPayload.name = payload.name;
  }
  if (payload.description !== currentDescription) {
    changedPayload.description = payload.description;
  }
  if (JSON.stringify(payload.layout) !== JSON.stringify(dashboard.layout)) {
    changedPayload.layout = payload.layout;
  }
  if (JSON.stringify(payload.config) !== JSON.stringify(dashboard.config)) {
    changedPayload.config = payload.config;
  }

  if (Object.keys(changedPayload).length === 0) {
    return {
      ok: false as const,
      message: '至少修改一个字段后再保存。'
    };
  }

  return {
    ok: true as const,
    value: changedPayload
  };
}

export function buildDashboardTemplateCreatePayload(input: { name: string; description: string }) {
  const payload: CreateDashboardFromTemplateRequest = {};
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length > 0) {
    payload.name = name;
  }
  if (description.length > 0) {
    payload.description = description;
  }

  return {
    ok: true as const,
    value: payload
  };
}

export function normalizePositiveInteger(value: string) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function normalizeOptionalText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}
