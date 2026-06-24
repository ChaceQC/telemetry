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
const DASHBOARD_PANEL_REMOTE_PREVIEW_MARKER_MAX_LENGTH = 18;
const DASHBOARD_PANEL_REMOTE_PREVIEW_METRIC_BAR_LIMIT = 8;
const DASHBOARD_PANEL_REMOTE_PREVIEW_TOPOLOGY_NODE_LIMIT = 5;
const DASHBOARD_PANEL_REMOTE_PREVIEW_TOPOLOGY_EDGE_LIMIT = 6;
const DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_WIDTH = 240;
const DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_TOP = 8;
const DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_HEIGHT = 68;
const DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_LABEL_MAX_LENGTH = 10;

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

export type DashboardPanelRemotePreviewTone = 'danger' | 'warning' | 'success' | 'neutral' | 'info';

export type DashboardPanelRemotePreviewLineMarker = {
  label: string;
  ariaLabel: string;
  tone: DashboardPanelRemotePreviewTone;
};

export type DashboardPanelRemotePreviewLine = {
  label: string;
  value: string;
  marker?: DashboardPanelRemotePreviewLineMarker;
};

export type DashboardPanelRemotePreviewMetricBar = {
  id: string;
  label: string;
  valueLabel: string;
  sampleCountLabel: string;
  windowLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: DashboardPanelRemotePreviewTone;
};

export type DashboardPanelRemotePreviewTopologyNode = {
  id: string;
  label: string;
  chartLabel: string;
  spanCountLabel: string;
  traceCountLabel: string;
  errorCountLabel: string;
  x: number;
  y: number;
  radius: number;
  tone: DashboardPanelRemotePreviewTone;
};

export type DashboardPanelRemotePreviewTopologyEdge = {
  id: string;
  label: string;
  callCountLabel: string;
  errorCountLabel: string;
  durationLabel: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  tone: DashboardPanelRemotePreviewTone;
};

export type DashboardPanelRemotePreviewVisualizationModel =
  | {
      kind: 'metrics';
      valueLabel: string;
      sampleCountLabel: string;
      windowLabel: string;
      axisY: number;
      sparklinePath: string | null;
      bars: DashboardPanelRemotePreviewMetricBar[];
    }
  | {
      kind: 'topology';
      nodeLabel: string;
      edgeLabel: string;
      nodes: DashboardPanelRemotePreviewTopologyNode[];
      edges: DashboardPanelRemotePreviewTopologyEdge[];
    };

export type DashboardPanelRemotePreviewModel = {
  title: string;
  summary: string;
  lines: DashboardPanelRemotePreviewLine[];
  emptyMessage: string | null;
  visualization: DashboardPanelRemotePreviewVisualizationModel | null;
};

type MetricPreviewItem = Extract<DashboardPanelPreviewResponse['preview'], { kind: 'metrics' }>['items'][number];
type TopologyPreviewNode = Extract<DashboardPanelPreviewResponse['preview'], { kind: 'topology' }>['nodes'][number];
type TopologyPreviewEdge = Extract<DashboardPanelPreviewResponse['preview'], { kind: 'topology' }>['edges'][number];

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
          `${formatMetricAggregateValue(item)} / 样本 ${item.sample_count} / ${formatPreviewTime(
            item.window_start
          )} - ${formatPreviewTime(item.window_end)}`
        )
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的指标聚合结果。' : null,
      visualization: createMetricAggregateVisualization(preview.items)
    };
  }

  if (preview.kind === 'logs') {
    return {
      title: '日志样例',
      summary: `${preview.items.length} 条最近日志`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.level} / ${formatPreviewSource(item.source)} / ${formatPreviewTime(item.received_at)}`),
        value: compactPreviewText(item.message),
        marker: createPreviewMarker(
          item.level,
          `日志级别 ${item.level}，来源 ${formatPreviewSource(item.source)}`,
          resolveLogLevelTone(item.level)
        )
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的日志样例。' : null,
      visualization: null
    };
  }

  if (preview.kind === 'events') {
    return {
      title: '事件样例',
      summary: `${preview.items.length} 条最近事件`,
      lines: preview.items.slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_SAMPLE_LIMIT).map((item) => ({
        label: compactPreviewText(`${item.type} / ${formatPreviewSource(item.source)} / ${formatPreviewTime(item.received_at)}`),
        value: compactPreviewText(formatPreviewPayload(item.payload)),
        marker: createPreviewMarker(item.type, `事件类型 ${item.type}，来源 ${formatPreviewSource(item.source)}`, 'neutral')
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的事件样例。' : null,
      visualization: null
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
        ),
        marker: createPreviewMarker(
          item.status_code ?? 'unknown',
          `Trace 状态 ${item.status_code ?? 'unknown'}，来源 ${formatPreviewSource(item.source)}`,
          resolveTraceStatusTone(item.status_code)
        )
      })),
      emptyMessage: preview.items.length === 0 ? '没有匹配的 trace 样例。' : null,
      visualization: null
    };
  }

  const topologyVisualization = createTopologyVisualization(preview.nodes, preview.edges);
  const topologyNodeCount = countTopologyPreviewSources(preview.nodes, preview.edges);

  return {
    title: 'Topology 摘要',
    summary: `${topologyNodeCount} 个节点 / ${preview.edges.length} 条边`,
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
    emptyMessage: preview.nodes.length === 0 && preview.edges.length === 0 ? '没有可展示的拓扑节点或边。' : null,
    visualization: topologyVisualization
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

function compactPreviewMarker(value: string) {
  return truncateText(value.replace(/\s+/g, ' ').trim() || 'unknown', DASHBOARD_PANEL_REMOTE_PREVIEW_MARKER_MAX_LENGTH);
}

function compactPreviewChartLabel(value: string) {
  return truncateText(value.replace(/\s+/g, ' ').trim() || 'unknown', DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_LABEL_MAX_LENGTH);
}

function createPreviewMarker(
  label: string,
  ariaLabel: string,
  tone: DashboardPanelRemotePreviewTone
): DashboardPanelRemotePreviewLineMarker {
  return {
    label: compactPreviewMarker(label),
    ariaLabel,
    tone
  };
}

function createMetricAggregateVisualization(items: MetricPreviewItem[]): DashboardPanelRemotePreviewVisualizationModel | null {
  if (items.length === 0) {
    return null;
  }

  const visualItems = [...items].sort(compareMetricPreviewItems).slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_METRIC_BAR_LIMIT);
  const values = visualItems.map((item) => safePreviewNumber(item.value));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const valueRange = maxValue === minValue ? 1 : maxValue - minValue;
  const axisY = normalizeMetricChartY(0, minValue, valueRange);
  const gap = visualItems.length > 1 ? 8 : 0;
  const availableWidth = DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_WIDTH - 20;
  const barWidth = Math.max(
    8,
    Math.min(24, (availableWidth - gap * Math.max(0, visualItems.length - 1)) / visualItems.length)
  );
  const totalBarWidth = barWidth * visualItems.length + gap * Math.max(0, visualItems.length - 1);
  const firstBarX = (DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_WIDTH - totalBarWidth) / 2;

  const bars = visualItems.map((item, index) => {
    const numericValue = safePreviewNumber(item.value);
    const valueY = normalizeMetricChartY(numericValue, minValue, valueRange);
    const barHeight = Math.max(3, Math.abs(axisY - valueY));

    return {
      id: `${index}-${item.name}-${formatPreviewSource(item.source)}-${item.window_start}`,
      label: compactPreviewText(`${item.name} / ${formatPreviewSource(item.source)}`),
      valueLabel: formatMetricAggregateValue(item),
      sampleCountLabel: `样本 ${item.sample_count}`,
      windowLabel: `${formatPreviewTime(item.window_start)} - ${formatPreviewTime(item.window_end)}`,
      x: roundChartNumber(firstBarX + index * (barWidth + gap)),
      y: roundChartNumber(Math.min(axisY, valueY)),
      width: roundChartNumber(barWidth),
      height: roundChartNumber(barHeight),
      tone: numericValue < 0 ? ('warning' as const) : ('info' as const)
    };
  });
  const sparklinePoints = bars.map((bar) => `${roundChartNumber(bar.x + bar.width / 2)} ${roundChartNumber(bar.y)}`);
  const primaryItem = visualItems[visualItems.length - 1];

  return {
    kind: 'metrics',
    valueLabel: formatMetricAggregateValue(primaryItem),
    sampleCountLabel: `样本 ${items.reduce((total, item) => total + Math.max(0, item.sample_count), 0)}`,
    windowLabel: createMetricWindowLabel(items),
    axisY: roundChartNumber(axisY),
    sparklinePath: sparklinePoints.length > 1 ? `M ${sparklinePoints.join(' L ')}` : null,
    bars
  };
}

function createTopologyVisualization(
  nodes: TopologyPreviewNode[],
  edges: TopologyPreviewEdge[]
): DashboardPanelRemotePreviewVisualizationModel | null {
  if (nodes.length === 0 && edges.length === 0) {
    return null;
  }

  const nodeBySource = createTopologyNodeMap(nodes, edges);
  const visibleNodes = [...nodeBySource.values()]
    .sort(compareTopologyPreviewNodes)
    .slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_TOPOLOGY_NODE_LIMIT);
  const positions = resolveTopologyNodePositions(visibleNodes.length);
  const maxSpanCount = Math.max(1, ...visibleNodes.map((node) => node.span_count));
  const visualNodes = visibleNodes.map((node, index) => ({
    id: node.source,
    label: compactPreviewText(node.source),
    chartLabel: compactPreviewChartLabel(node.source),
    spanCountLabel: `spans ${node.span_count}`,
    traceCountLabel: `traces ${node.trace_count}`,
    errorCountLabel: `errors ${node.error_span_count}`,
    x: positions[index].x,
    y: positions[index].y,
    radius: roundChartNumber(8 + (node.span_count / maxSpanCount) * 5),
    tone: node.error_span_count > 0 ? ('danger' as const) : node.span_count === 0 ? ('neutral' as const) : ('info' as const)
  }));
  const visualNodeBySource = new Map(visualNodes.map((node) => [node.id, node]));
  const visibleEdges = edges
    .filter((edge) => visualNodeBySource.has(edge.from_source) && visualNodeBySource.has(edge.to_source))
    .sort(compareTopologyPreviewEdges)
    .slice(0, DASHBOARD_PANEL_REMOTE_PREVIEW_TOPOLOGY_EDGE_LIMIT);
  const maxCallCount = Math.max(1, ...visibleEdges.map((edge) => edge.call_count));
  const visualEdges = visibleEdges.map((edge, index) => {
    const fromNode = visualNodeBySource.get(edge.from_source);
    const toNode = visualNodeBySource.get(edge.to_source);
    const edgeTone: DashboardPanelRemotePreviewTone = edge.error_count > 0 ? 'danger' : 'info';

    return {
      id: `${index}-${edge.from_source}-${edge.to_source}`,
      label: compactPreviewText(`${edge.from_source} -> ${edge.to_source}`),
      callCountLabel: `调用 ${edge.call_count}`,
      errorCountLabel: `错误 ${edge.error_count}`,
      durationLabel: `avg ${formatPreviewDuration(edge.avg_duration_ms)} / max ${formatPreviewDuration(edge.max_duration_ms)}`,
      x1: fromNode?.x ?? 0,
      y1: fromNode?.y ?? 0,
      x2: toNode?.x ?? 0,
      y2: toNode?.y ?? 0,
      strokeWidth: roundChartNumber(1.6 + (edge.call_count / maxCallCount) * 3.2),
      tone: edgeTone
    };
  });

  return {
    kind: 'topology',
    nodeLabel: createTopologyCountLabel(visualNodes.length, nodeBySource.size, '个节点'),
    edgeLabel: createTopologyCountLabel(visualEdges.length, edges.length, '条边'),
    nodes: visualNodes,
    edges: visualEdges
  };
}

function createTopologyNodeMap(nodes: TopologyPreviewNode[], edges: TopologyPreviewEdge[]) {
  const nodeBySource = new Map<string, TopologyPreviewNode>();
  for (const node of nodes) {
    nodeBySource.set(node.source, node);
  }
  for (const edge of edges) {
    if (!nodeBySource.has(edge.from_source)) {
      nodeBySource.set(edge.from_source, createSyntheticTopologyNode(edge.from_source));
    }
    if (!nodeBySource.has(edge.to_source)) {
      nodeBySource.set(edge.to_source, createSyntheticTopologyNode(edge.to_source));
    }
  }

  return nodeBySource;
}

function countTopologyPreviewSources(nodes: TopologyPreviewNode[], edges: TopologyPreviewEdge[]) {
  return createTopologyNodeMap(nodes, edges).size;
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

function formatMetricAggregateValue(item: MetricPreviewItem) {
  return `${item.aggregation} ${formatPreviewNumber(item.value)}${item.unit ? ` ${item.unit}` : ''}`;
}

function createMetricWindowLabel(items: MetricPreviewItem[]) {
  const orderedItems = [...items].sort(compareMetricPreviewItems);
  const firstItem = orderedItems[0];
  const lastItem = orderedItems[orderedItems.length - 1];

  return `${formatPreviewTime(firstItem.window_start)} - ${formatPreviewTime(lastItem.window_end)}`;
}

function compareMetricPreviewItems(left: MetricPreviewItem, right: MetricPreviewItem) {
  const startDiff = left.window_start.localeCompare(right.window_start);
  if (startDiff !== 0) {
    return startDiff;
  }

  const endDiff = left.window_end.localeCompare(right.window_end);
  if (endDiff !== 0) {
    return endDiff;
  }

  const nameDiff = left.name.localeCompare(right.name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return formatPreviewSource(left.source).localeCompare(formatPreviewSource(right.source));
}

function compareTopologyPreviewNodes(left: TopologyPreviewNode, right: TopologyPreviewNode) {
  const spanDiff = right.span_count - left.span_count;
  if (spanDiff !== 0) {
    return spanDiff;
  }

  const errorDiff = right.error_span_count - left.error_span_count;
  if (errorDiff !== 0) {
    return errorDiff;
  }

  return left.source.localeCompare(right.source);
}

function compareTopologyPreviewEdges(left: TopologyPreviewEdge, right: TopologyPreviewEdge) {
  const callDiff = right.call_count - left.call_count;
  if (callDiff !== 0) {
    return callDiff;
  }

  const errorDiff = right.error_count - left.error_count;
  if (errorDiff !== 0) {
    return errorDiff;
  }

  const fromDiff = left.from_source.localeCompare(right.from_source);
  return fromDiff !== 0 ? fromDiff : left.to_source.localeCompare(right.to_source);
}

function createTopologyCountLabel(visibleCount: number, totalCount: number, unit: string) {
  return visibleCount === totalCount ? `${visibleCount} ${unit}` : `显示 ${visibleCount}/${totalCount} ${unit}`;
}

function normalizeMetricChartY(value: number, minValue: number, valueRange: number) {
  return (
    DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_TOP +
    ((minValue + valueRange - value) / valueRange) * DASHBOARD_PANEL_REMOTE_PREVIEW_CHART_HEIGHT
  );
}

function safePreviewNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function roundChartNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveLogLevelTone(level: string): DashboardPanelRemotePreviewTone {
  const normalizedLevel = level.trim().toLowerCase();

  if (['fatal', 'panic', 'critical', 'crit', 'error', 'err'].includes(normalizedLevel)) {
    return 'danger';
  }
  if (['warn', 'warning'].includes(normalizedLevel)) {
    return 'warning';
  }
  if (['info', 'notice'].includes(normalizedLevel)) {
    return 'info';
  }

  return 'neutral';
}

function resolveTraceStatusTone(statusCode: string | null): DashboardPanelRemotePreviewTone {
  const normalizedStatus = statusCode?.trim().toLowerCase();

  if (!normalizedStatus || normalizedStatus === 'unknown') {
    return 'neutral';
  }
  if (['ok', 'success', '2xx'].includes(normalizedStatus)) {
    return 'success';
  }
  if (normalizedStatus.includes('error') || normalizedStatus.includes('fail')) {
    return 'danger';
  }

  return 'warning';
}

function createSyntheticTopologyNode(source: string): TopologyPreviewNode {
  return {
    source,
    span_count: 0,
    trace_count: 0,
    error_span_count: 0,
    avg_duration_ms: null,
    max_duration_ms: null
  };
}

function resolveTopologyNodePositions(count: number) {
  const positionsByCount = new Map<number, Array<{ x: number; y: number }>>([
    [1, [{ x: 120, y: 56 }]],
    [
      2,
      [
        { x: 66, y: 56 },
        { x: 174, y: 56 }
      ]
    ],
    [
      3,
      [
        { x: 120, y: 26 },
        { x: 68, y: 84 },
        { x: 172, y: 84 }
      ]
    ],
    [
      4,
      [
        { x: 66, y: 34 },
        { x: 174, y: 34 },
        { x: 66, y: 82 },
        { x: 174, y: 82 }
      ]
    ],
    [
      5,
      [
        { x: 120, y: 22 },
        { x: 54, y: 48 },
        { x: 78, y: 92 },
        { x: 162, y: 92 },
        { x: 186, y: 48 }
      ]
    ]
  ]);

  return positionsByCount.get(count) ?? positionsByCount.get(DASHBOARD_PANEL_REMOTE_PREVIEW_TOPOLOGY_NODE_LIMIT)!;
}
