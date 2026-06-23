import type { DashboardJson, DashboardPanelPreviewResponse } from '../../api/dashboards';

export const DASHBOARD_PANEL_TYPES = ['metrics', 'logs', 'events', 'traces', 'topology'] as const;
export const DASHBOARD_PANEL_ID_MAX_LENGTH = 64;
export const DASHBOARD_PANEL_TITLE_MAX_LENGTH = 120;
export const DASHBOARD_PANEL_PREVIEW_COLUMNS = 12;

const DASHBOARD_PANEL_QUERY_SUMMARY_MAX_LENGTH = 180;
const DASHBOARD_PANEL_QUERY_VALUE_MAX_LENGTH = 48;
const DASHBOARD_PANEL_QUERY_TOP_LEVEL_LIMIT = 4;
const DASHBOARD_PANEL_QUERY_NESTED_LIMIT = 3;
const DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT = 3;
const DASHBOARD_PANEL_REMOTE_PREVIEW_TEXT_MAX_LENGTH = 96;

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

export type DashboardPanelPreviewItem = {
  id: string;
  title: string;
  type: DashboardPanelType;
  originalIndex: number;
  layout: DashboardPanelLayout | null;
  layoutLabel: string;
  querySummary: string;
  gridColumn: string;
};

export type DashboardPanelPreviewModel =
  | {
      state: 'invalid';
      statusLabel: string;
      message: string;
      panels: [];
    }
  | {
      state: 'legacy';
      statusLabel: string;
      message: string;
      panels: [];
    }
  | {
      state: 'empty';
      statusLabel: string;
      message: string;
      panels: [];
    }
  | {
      state: 'ready';
      statusLabel: string;
      message: string;
      columns: number;
      panels: DashboardPanelPreviewItem[];
    };

export type DashboardPanelRemotePreviewLine = {
  label: string;
  value: string;
};

export type DashboardPanelRemotePreviewModel = {
  title: string;
  summary: string;
  lines: DashboardPanelRemotePreviewLine[];
  emptyMessage: string | null;
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

export function createDashboardPanelPreviewModel(panelReadResult: DashboardPanelsReadResult): DashboardPanelPreviewModel {
  if (!panelReadResult.ok) {
    return {
      state: 'invalid',
      statusLabel: '配置错误',
      message: panelReadResult.message,
      panels: []
    };
  }

  if (panelReadResult.panels.length === 0) {
    if (!panelReadResult.hasPanels) {
      return {
        state: 'legacy',
        statusLabel: 'Legacy',
        message: '当前 config 未包含 panels。',
        panels: []
      };
    }

    return {
      state: 'empty',
      statusLabel: '0 个 panel',
      message: '当前 config.panels 数组为空。',
      panels: []
    };
  }

  const panels = panelReadResult.panels
    .map((panel, index) => createDashboardPanelPreviewItem(panel, index))
    .sort(compareDashboardPanelPreviewItems);

  return {
    state: 'ready',
    statusLabel: `${panels.length} 个 panel`,
    message: '按 layout 的 y/x 顺序排列，未配置 layout 的 panel 排在末尾。',
    columns: DASHBOARD_PANEL_PREVIEW_COLUMNS,
    panels
  };
}

export function summarizeDashboardPanelQuery(query: Record<string, unknown>) {
  const keys = Object.keys(query).sort();

  if (keys.length === 0) {
    return 'query {}';
  }

  const parts = keys
    .slice(0, DASHBOARD_PANEL_QUERY_TOP_LEVEL_LIMIT)
    .map((key) => `${key}: ${summarizeDashboardPanelQueryValue(query[key], 0)}`);

  if (keys.length > DASHBOARD_PANEL_QUERY_TOP_LEVEL_LIMIT) {
    parts.push(`+${keys.length - DASHBOARD_PANEL_QUERY_TOP_LEVEL_LIMIT} keys`);
  }

  return truncateText(`query { ${parts.join(', ')} }`, DASHBOARD_PANEL_QUERY_SUMMARY_MAX_LENGTH);
}

export function createDashboardPanelRemotePreviewModel(
  response: DashboardPanelPreviewResponse
): DashboardPanelRemotePreviewModel {
  const preview = response.preview;

  if (preview.kind === 'metrics') {
    return {
      title: '指标聚合',
      summary: `${preview.items.length} 条聚合结果`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.name} / ${formatPreviewSource(item.source)}`),
        value: compactPreviewText(
          `${item.aggregation} ${formatPreviewNumber(item.value)}${item.unit ? ` ${item.unit}` : ''} / 样本 ${
            item.sample_count
          } / ${formatPreviewTime(item.window_start)} - ${formatPreviewTime(item.window_end)}`
        )
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的指标聚合结果。' : null
    };
  }

  if (preview.kind === 'logs') {
    return {
      title: '日志样例',
      summary: `${preview.items.length} 条最近日志`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.level} / ${formatPreviewSource(item.source)} / ${formatPreviewTime(item.received_at)}`),
        value: compactPreviewText(item.message)
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的日志样例。' : null
    };
  }

  if (preview.kind === 'events') {
    return {
      title: '事件样例',
      summary: `${preview.items.length} 条最近事件`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.type} / ${formatPreviewSource(item.source)} / ${formatPreviewTime(item.received_at)}`),
        value: compactPreviewText(formatPreviewPayload(item.payload))
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的事件样例。' : null
    };
  }

  if (preview.kind === 'traces') {
    return {
      title: 'Trace 样例',
      summary: `${preview.items.length} 条最近 span`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.trace_id} / ${item.span_id}`),
        value: compactPreviewText(
          `${item.name} / ${item.status_code ?? 'unknown'} / ${formatPreviewDuration(item.duration_ms)} / ${formatPreviewSource(
            item.source
          )}`
        )
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的 trace 样例。' : null
    };
  }

  return {
    title: 'Topology 摘要',
    summary: `${preview.nodes.length} 个节点 / ${preview.edges.length} 条边`,
    lines: [
      ...preview.edges.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((edge) => ({
        label: compactPreviewText(`${edge.from_source} -> ${edge.to_source}`),
        value: compactPreviewText(
          `调用 ${edge.call_count} / 错误 ${edge.error_count} / avg ${formatPreviewDuration(
            edge.avg_duration_ms
          )} / max ${formatPreviewDuration(edge.max_duration_ms)}`
        )
      })),
      ...preview.nodes.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((node) => ({
        label: compactPreviewText(`node ${node.source}`),
        value: compactPreviewText(
          `spans ${node.span_count} / traces ${node.trace_count} / errors ${node.error_span_count}`
        )
      }))
    ].slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT),
    emptyMessage: preview.nodes.length === 0 && preview.edges.length === 0 ? '没有可展示的拓扑节点或边。' : null
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

function createDashboardPanelPreviewItem(panel: DashboardPanel, originalIndex: number): DashboardPanelPreviewItem {
  const layout = panel.layout ?? null;

  return {
    id: panel.id,
    title: panel.title,
    type: panel.type,
    originalIndex,
    layout,
    layoutLabel: layout
      ? `x ${formatPanelNumber(layout.x)} / y ${formatPanelNumber(layout.y)} / w ${formatPanelNumber(
          layout.w
        )} / h ${formatPanelNumber(layout.h)}`
      : 'no layout',
    querySummary: summarizeDashboardPanelQuery(panel.query),
    gridColumn: resolvePreviewGridColumn(layout)
  };
}

function compareDashboardPanelPreviewItems(left: DashboardPanelPreviewItem, right: DashboardPanelPreviewItem) {
  const leftHasLayout = left.layout !== null;
  const rightHasLayout = right.layout !== null;

  if (leftHasLayout !== rightHasLayout) {
    return leftHasLayout ? -1 : 1;
  }

  if (left.layout && right.layout) {
    const yDiff = left.layout.y - right.layout.y;
    if (yDiff !== 0) {
      return yDiff;
    }

    const xDiff = left.layout.x - right.layout.x;
    if (xDiff !== 0) {
      return xDiff;
    }
  }

  return left.originalIndex - right.originalIndex;
}

function resolvePreviewGridColumn(layout: DashboardPanelLayout | null) {
  if (!layout) {
    return '1 / -1';
  }

  const start = clampNumber(Math.floor(layout.x), 0, DASHBOARD_PANEL_PREVIEW_COLUMNS - 1) + 1;
  const maxSpan = DASHBOARD_PANEL_PREVIEW_COLUMNS - start + 1;
  const span = clampNumber(Math.ceil(layout.w), 1, maxSpan);

  return `${start} / span ${span}`;
}

function summarizeDashboardPanelQueryValue(value: unknown, depth: number): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    const compactValue = value.replace(/\s+/g, ' ').trim();
    const truncatedValue = truncateText(compactValue, DASHBOARD_PANEL_QUERY_VALUE_MAX_LENGTH);
    const suffix = compactValue.length > DASHBOARD_PANEL_QUERY_VALUE_MAX_LENGTH ? ` (${compactValue.length} chars)` : '';

    return `${JSON.stringify(truncatedValue)}${suffix}`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    if (depth >= 1) {
      return `[${value.length} items]`;
    }

    const items = value
      .slice(0, DASHBOARD_PANEL_QUERY_NESTED_LIMIT)
      .map((item) => summarizeDashboardPanelQueryValue(item, depth + 1));
    const suffix = value.length > DASHBOARD_PANEL_QUERY_NESTED_LIMIT ? ', ...' : '';

    return `[${value.length} items: ${items.join(', ')}${suffix}]`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort();

    if (keys.length === 0) {
      return '{}';
    }

    const suffix = keys.length > DASHBOARD_PANEL_QUERY_NESTED_LIMIT ? ', ...' : '';
    const visibleKeys = keys.slice(0, DASHBOARD_PANEL_QUERY_NESTED_LIMIT).join(', ');

    return `{${keys.length} keys: ${visibleKeys}${suffix}}`;
  }

  return typeof value;
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

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatPanelNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function compactPreviewText(value: string) {
  return truncateText(value.replace(/\s+/g, ' ').trim() || '-', DASHBOARD_PANEL_REMOTE_PREVIEW_TEXT_MAX_LENGTH);
}

function formatPreviewSource(value: string | null) {
  return value?.trim() || 'unknown';
}

function formatPreviewTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').replace(/(\.\d+)?Z$/, 'Z');
}

function formatPreviewNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 1000) / 1000}`;
}

function formatPreviewDuration(value: number | null) {
  if (value === null) {
    return '-';
  }

  return `${formatPreviewNumber(value)}ms`;
}

function formatPreviewPayload(value: Record<string, unknown>) {
  const keys = Object.keys(value).sort();

  if (keys.length === 0) {
    return 'payload {}';
  }

  return `payload { ${keys
    .slice(0, DASHBOARD_PANEL_QUERY_NESTED_LIMIT)
    .map((key) => `${key}: ${summarizeDashboardPanelQueryValue(value[key], 1)}`)
    .join(', ')}${keys.length > DASHBOARD_PANEL_QUERY_NESTED_LIMIT ? ', ...' : ''} }`;
}
