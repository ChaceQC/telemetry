import type { DashboardJson } from '../../api/dashboards';

export const DASHBOARD_PANEL_TYPES = ['metrics', 'logs', 'events', 'traces', 'topology'] as const;
export const DASHBOARD_PANEL_ID_MAX_LENGTH = 64;
export const DASHBOARD_PANEL_TITLE_MAX_LENGTH = 120;

export type DashboardPanelType = (typeof DASHBOARD_PANEL_TYPES)[number];

export type DashboardPanelLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardPanel = Record<string, unknown> & {
  id: string;
  title: string;
  type: DashboardPanelType;
  query: Record<string, unknown>;
  layout?: DashboardPanelLayout;
};

export type DashboardPanelDraft = {
  mode: 'create' | 'edit';
  editIndex: number | null;
  originalPanelId: string | null;
  id: string;
  title: string;
  type: DashboardPanelType;
  queryText: string;
  layout: {
    x: string;
    y: string;
    w: string;
    h: string;
  };
};

export type DashboardPanelsReadResult =
  | {
      ok: true;
      config: Record<string, unknown>;
      panels: DashboardPanel[];
      hasPanels: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type DashboardPanelsParseResult =
  | {
      ok: true;
      config: Record<string, unknown>;
      rawPanels: unknown[];
      panels: DashboardPanel[];
      hasPanels: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type ValidationResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      message: string;
    };

export function validateDashboardConfigPanels(config: DashboardJson) {
  const normalized = normalizeDashboardConfigPanels(config);
  return normalized.ok ? null : normalized.message;
}

export function normalizeDashboardConfigPanels(config: DashboardJson): ValidationResult<DashboardJson> {
  if (!isRecord(config) || !('panels' in config)) {
    return {
      ok: true,
      value: config
    };
  }

  const panels = config.panels;
  if (!Array.isArray(panels)) {
    return {
      ok: false,
      message: 'config.panels 必须是数组。'
    };
  }

  const normalized = normalizeDashboardPanelCollection(panels, 'config.panels');
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    value: {
      ...config,
      panels: normalized.value
    }
  };
}

export function readDashboardPanelsFromConfigText(configText: string): DashboardPanelsReadResult {
  const parsed = parseDashboardConfigForPanels(configText);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    config: parsed.config,
    panels: parsed.panels,
    hasPanels: parsed.hasPanels
  };
}

export function createDefaultDashboardPanelDraft(panels: Array<Pick<DashboardPanel, 'id'>> = []): DashboardPanelDraft {
  return {
    mode: 'create',
    editIndex: null,
    originalPanelId: null,
    id: resolveNextPanelId(panels),
    title: 'New panel',
    type: 'metrics',
    queryText: '{}',
    layout: {
      x: '0',
      y: '0',
      w: '6',
      h: '4'
    }
  };
}

export function dashboardPanelToDraft(panel: DashboardPanel, index: number): DashboardPanelDraft {
  return {
    mode: 'edit',
    editIndex: index,
    originalPanelId: panel.id,
    id: panel.id,
    title: panel.title,
    type: panel.type,
    queryText: formatDashboardPanelJson(panel.query),
    layout: {
      x: formatPanelNumber(panel.layout?.x ?? 0),
      y: formatPanelNumber(panel.layout?.y ?? 0),
      w: formatPanelNumber(panel.layout?.w ?? 6),
      h: formatPanelNumber(panel.layout?.h ?? 4)
    }
  };
}

export function upsertDashboardPanelInConfigText(configText: string, draft: DashboardPanelDraft) {
  const parsed = parseDashboardConfigForPanels(configText);
  if (!parsed.ok) {
    return parsed;
  }

  const draftPanel = dashboardPanelDraftToPanel(draft);
  if (!draftPanel.ok) {
    return draftPanel;
  }

  const nextPanels = [...parsed.rawPanels];
  if (draft.mode === 'edit') {
    if (draft.editIndex === null || draft.editIndex < 0) {
      return {
        ok: false as const,
        message: '请选择要更新的 panel。'
      };
    }
    if (
      draft.originalPanelId === null ||
      draft.editIndex >= nextPanels.length ||
      parsed.panels[draft.editIndex]?.id !== draft.originalPanelId.trim()
    ) {
      return {
        ok: false as const,
        message: '当前 config.panels 已变化，请重新选择要更新的 panel。'
      };
    }
    nextPanels[draft.editIndex] = draftPanel.value;
  } else {
    nextPanels.push(draftPanel.value);
  }

  return buildConfigWithPanels(parsed.config, nextPanels);
}

export function removeDashboardPanelFromConfigText(configText: string, index: number) {
  const parsed = parseDashboardConfigForPanels(configText);
  if (!parsed.ok) {
    return parsed;
  }

  if (index < 0 || index >= parsed.rawPanels.length) {
    return {
      ok: false as const,
      message: '请选择要删除的 panel。'
    };
  }

  const nextPanels = parsed.rawPanels.filter((_, panelIndex) => panelIndex !== index);
  return buildConfigWithPanels(parsed.config, nextPanels);
}

export function formatDashboardPanelJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseDashboardConfigForPanels(configText: string): DashboardPanelsParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch {
    return {
      ok: false,
      message: 'config 不是有效 JSON。'
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: 'config 必须是 JSON 对象才能使用 panels。'
    };
  }

  if (!('panels' in parsed)) {
    return {
      ok: true,
      config: parsed,
      rawPanels: [],
      panels: [],
      hasPanels: false
    };
  }

  if (!Array.isArray(parsed.panels)) {
    return {
      ok: false,
      message: 'config.panels 必须是数组。'
    };
  }

  const normalized = normalizeDashboardPanelCollection(parsed.panels, 'config.panels');
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    config: parsed,
    rawPanels: parsed.panels,
    panels: normalized.value,
    hasPanels: true
  };
}

function buildConfigWithPanels(config: Record<string, unknown>, rawPanels: unknown[]) {
  const normalized = normalizeDashboardPanelCollection(rawPanels, 'config.panels');
  if (!normalized.ok) {
    return normalized;
  }

  const nextConfig = {
    ...config,
    panels: normalized.value
  };

  return {
    ok: true as const,
    value: nextConfig,
    configText: formatDashboardPanelJson(nextConfig)
  };
}

function dashboardPanelDraftToPanel(draft: DashboardPanelDraft): ValidationResult<DashboardPanel> {
  const id = validatePanelString(draft.id, 'panel.id', DASHBOARD_PANEL_ID_MAX_LENGTH);
  if (!id.ok) {
    return id;
  }

  const title = validatePanelString(draft.title, 'panel.title', DASHBOARD_PANEL_TITLE_MAX_LENGTH);
  if (!title.ok) {
    return title;
  }

  const type = validatePanelString(draft.type, 'panel.type', Math.max(...DASHBOARD_PANEL_TYPES.map((value) => value.length)));
  if (!type.ok) {
    return type;
  }

  if (!isDashboardPanelType(type.value)) {
    return {
      ok: false,
      message: 'panel.type 必须是 metrics/logs/events/traces/topology 之一。'
    };
  }

  const query = parsePanelQuery(draft.queryText);
  if (!query.ok) {
    return query;
  }

  const layout = parsePanelDraftLayout(draft.layout);
  if (!layout.ok) {
    return layout;
  }

  return {
    ok: true,
    value: {
      id: id.value,
      title: title.value,
      type: type.value,
      query: query.value,
      layout: layout.value
    }
  };
}

function parsePanelQuery(queryText: string): ValidationResult<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(queryText);
  } catch {
    return {
      ok: false,
      message: 'panel.query 不是有效 JSON。'
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: 'panel.query 必须是 JSON 对象。'
    };
  }

  return {
    ok: true,
    value: parsed
  };
}

function parsePanelDraftLayout(layout: DashboardPanelDraft['layout']): ValidationResult<DashboardPanelLayout> {
  const x = parseLayoutNumber(layout.x, 'panel.layout.x', 0);
  if (!x.ok) {
    return x;
  }
  const y = parseLayoutNumber(layout.y, 'panel.layout.y', 0);
  if (!y.ok) {
    return y;
  }
  const w = parseLayoutNumber(layout.w, 'panel.layout.w', 1);
  if (!w.ok) {
    return w;
  }
  const h = parseLayoutNumber(layout.h, 'panel.layout.h', 1);
  if (!h.ok) {
    return h;
  }

  return {
    ok: true,
    value: {
      x: x.value,
      y: y.value,
      w: w.value,
      h: h.value
    }
  };
}

function parseLayoutNumber(value: string, fieldPath: string, minimum: number): ValidationResult<number> {
  if (value.trim().length === 0) {
    return {
      ok: false,
      message: `${fieldPath} 为必填字段。`
    };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是有限数字。`
    };
  }

  if (numericValue < minimum) {
    return {
      ok: false,
      message: `${fieldPath} 不能小于 ${minimum}。`
    };
  }

  return {
    ok: true,
    value: numericValue
  };
}

function normalizeDashboardPanelCollection(panels: unknown[], fieldPath: string): ValidationResult<DashboardPanel[]> {
  const normalizedPanels: DashboardPanel[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < panels.length; index += 1) {
    const panelPath = `${fieldPath}[${index}]`;
    const panel = normalizeDashboardPanel(panels[index], panelPath);
    if (!panel.ok) {
      return panel;
    }

    if (seenIds.has(panel.value.id)) {
      return {
        ok: false,
        message: `${panelPath}.id 不能重复。`
      };
    }

    seenIds.add(panel.value.id);
    normalizedPanels.push(panel.value);
  }

  return {
    ok: true,
    value: normalizedPanels
  };
}

function normalizeDashboardPanel(value: unknown, fieldPath: string): ValidationResult<DashboardPanel> {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是 JSON 对象。`
    };
  }

  const id = getPanelString(value, 'id', fieldPath, DASHBOARD_PANEL_ID_MAX_LENGTH);
  if (!id.ok) {
    return id;
  }

  const title = getPanelString(value, 'title', fieldPath, DASHBOARD_PANEL_TITLE_MAX_LENGTH);
  if (!title.ok) {
    return title;
  }

  const type = getPanelString(value, 'type', fieldPath, Math.max(...DASHBOARD_PANEL_TYPES.map((panelType) => panelType.length)));
  if (!type.ok) {
    return type;
  }

  if (!isDashboardPanelType(type.value)) {
    return {
      ok: false,
      message: `${fieldPath}.type 必须是 metrics/logs/events/traces/topology 之一。`
    };
  }

  if (!isRecord(value.query)) {
    return {
      ok: false,
      message: `${fieldPath}.query 必须是 JSON 对象。`
    };
  }

  const normalizedPanel: DashboardPanel = {
    ...value,
    id: id.value,
    title: title.value,
    type: type.value,
    query: value.query
  };

  if ('layout' in value) {
    const layout = normalizeDashboardPanelLayout(value.layout, `${fieldPath}.layout`);
    if (!layout.ok) {
      return layout;
    }
    normalizedPanel.layout = layout.value;
  }

  return {
    ok: true,
    value: normalizedPanel
  };
}

function normalizeDashboardPanelLayout(value: unknown, fieldPath: string): ValidationResult<DashboardPanelLayout> {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是 JSON 对象。`
    };
  }

  const x = getLayoutNumber(value, 'x', fieldPath, 0);
  if (!x.ok) {
    return x;
  }
  const y = getLayoutNumber(value, 'y', fieldPath, 0);
  if (!y.ok) {
    return y;
  }
  const w = getLayoutNumber(value, 'w', fieldPath, 1);
  if (!w.ok) {
    return w;
  }
  const h = getLayoutNumber(value, 'h', fieldPath, 1);
  if (!h.ok) {
    return h;
  }

  return {
    ok: true,
    value: {
      x: x.value,
      y: y.value,
      w: w.value,
      h: h.value
    }
  };
}

function getPanelString(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string,
  maxLength: number
): ValidationResult<string> {
  if (!(key in mapping)) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 为必填字段。`
    };
  }

  const value = mapping[key];
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${fieldPath}.${key} 必须是字符串。`
    };
  }

  return validatePanelString(value, `${fieldPath}.${key}`, maxLength);
}

function validatePanelString(value: string, fieldPath: string, maxLength: number): ValidationResult<string> {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return {
      ok: false,
      message: `${fieldPath} 不能为空。`
    };
  }

  if (trimmedValue.length > maxLength) {
    return {
      ok: false,
      message: `${fieldPath} 不能超过 ${maxLength} 字符。`
    };
  }

  return {
    ok: true,
    value: trimmedValue
  };
}

function getLayoutNumber(
  mapping: Record<string, unknown>,
  key: keyof DashboardPanelLayout,
  fieldPath: string,
  minimum: number
): ValidationResult<number> {
  if (!(key in mapping)) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 为必填字段。`
    };
  }

  const value = mapping[key];
  if (typeof value === 'boolean' || typeof value !== 'number') {
    return {
      ok: false,
      message: `${fieldPath}.${key} 必须是数字。`
    };
  }

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 必须是有限数字。`
    };
  }

  if (value < minimum) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 不能小于 ${minimum}。`
    };
  }

  return {
    ok: true,
    value
  };
}

function resolveNextPanelId(panels: Array<Pick<DashboardPanel, 'id'>>) {
  const existingIds = new Set(panels.map((panel) => panel.id.trim()));

  for (let index = 1; index <= panels.length + 1; index += 1) {
    const nextId = `panel-${index}`;
    if (!existingIds.has(nextId)) {
      return nextId;
    }
  }

  return `panel-${panels.length + 2}`;
}

function isDashboardPanelType(value: string): value is DashboardPanelType {
  return DASHBOARD_PANEL_TYPES.includes(value as DashboardPanelType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatPanelNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}
