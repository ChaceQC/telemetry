import {
  DASHBOARD_EXPORT_SCHEMA,
  DASHBOARD_EXPORT_VERSION,
  type Dashboard,
  type DashboardExportDocument,
  type DashboardJson
} from '../../api/dashboards';
import { normalizeDashboardConfigPanels } from './dashboardPanels';
import { normalizeDashboardConfigTimeRange } from './dashboardTimeRange';
import { normalizeDashboardConfigVariables } from './dashboardVariables';

export const DEFAULT_DASHBOARD_LAYOUT = {
  version: 1,
  widgets: []
};

export const DEFAULT_DASHBOARD_CONFIG = {
  refresh_seconds: 30
};

export const DASHBOARD_JSON_MAX_BYTES = 64 * 1024;
export const DASHBOARD_JSON_MAX_DEPTH = 32;
export const DASHBOARD_JSON_MAX_NODES = 4096;
export const DASHBOARD_JSON_TEXT_MAX_LENGTH = DASHBOARD_JSON_MAX_BYTES;

export type DashboardJsonParseResult =
  | {
      ok: true;
      value: DashboardJson;
    }
  | {
      ok: false;
      message: string;
    };

export type DashboardImportDocumentParseResult =
  | {
      ok: true;
      value: DashboardExportDocument;
    }
  | {
      ok: false;
      message: string;
    };

export function parseDashboardJsonField(value: string, label: string): DashboardJsonParseResult {
  if (containsNonFiniteJsonToken(value)) {
    return {
      ok: false,
      message: `${label} 不能包含 NaN 或 Infinity。`
    };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isDashboardJsonContainer(parsed)) {
      return {
        ok: false,
        message: `${label} 必须是 JSON 对象或数组。`
      };
    }

    const validationError = validateDashboardJsonValue(parsed, label);
    if (validationError) {
      return {
        ok: false,
        message: validationError
      };
    }

    if (label === 'config') {
      const normalizedTimeRangeConfig = normalizeDashboardConfigTimeRange(parsed);
      if (!normalizedTimeRangeConfig.ok) {
        return normalizedTimeRangeConfig;
      }

      const normalizedPanelConfig = normalizeDashboardConfigPanels(normalizedTimeRangeConfig.value);
      if (!normalizedPanelConfig.ok) {
        return normalizedPanelConfig;
      }

      const normalizedVariableConfig = normalizeDashboardConfigVariables(normalizedPanelConfig.value);
      if (!normalizedVariableConfig.ok) {
        return normalizedVariableConfig;
      }

      return {
        ok: true,
        value: normalizedVariableConfig.value
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

export function parseDashboardImportDocument(value: string): DashboardImportDocumentParseResult {
  if (!value.trim()) {
    return {
      ok: false,
      message: '导入文档不能为空。'
    };
  }

  if (containsNonFiniteJsonToken(value)) {
    return {
      ok: false,
      message: '导入文档不能包含 NaN 或 Infinity。'
    };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isPlainJsonObject(parsed)) {
      return {
        ok: false,
        message: '导入文档必须是 JSON 对象。'
      };
    }

    const forbiddenFields = getDashboardImportForbiddenFields(parsed);
    if (forbiddenFields.length > 0) {
      return {
        ok: false,
        message: `导入文档不能包含实例字段: ${forbiddenFields.join(', ')}。`
      };
    }

    const requiredFields = ['schema', 'version', 'name', 'description', 'layout', 'config'] as const;
    const missingField = requiredFields.find((field) => !(field in parsed));
    if (missingField) {
      return {
        ok: false,
        message: `导入文档缺少 ${missingField} 字段。`
      };
    }

    if (parsed.schema !== DASHBOARD_EXPORT_SCHEMA) {
      return {
        ok: false,
        message: `schema 必须是 ${DASHBOARD_EXPORT_SCHEMA}。`
      };
    }

    if (parsed.version !== DASHBOARD_EXPORT_VERSION) {
      return {
        ok: false,
        message: `version 必须是 ${DASHBOARD_EXPORT_VERSION}。`
      };
    }

    const name = normalizeImportName(parsed.name);
    if (!name) {
      return {
        ok: false,
        message: '导入文档 name 必须是非空字符串。'
      };
    }

    const description = normalizeImportDescription(parsed.description);
    if (!description.ok) {
      return description;
    }

    const layout = normalizeDashboardImportJsonField(parsed.layout, 'layout');
    if (!layout.ok) {
      return layout;
    }

    const config = normalizeDashboardImportJsonField(parsed.config, 'config');
    if (!config.ok) {
      return config;
    }

    return {
      ok: true,
      value: {
        schema: DASHBOARD_EXPORT_SCHEMA,
        version: DASHBOARD_EXPORT_VERSION,
        name,
        description: description.value,
        layout: layout.value,
        config: config.value
      }
    };
  } catch {
    return {
      ok: false,
      message: '导入文档不是有效 JSON。'
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

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDashboardImportJsonField(value: unknown, label: 'layout' | 'config'): DashboardJsonParseResult {
  if (!isDashboardJsonContainer(value)) {
    return {
      ok: false,
      message: `${label} 必须是 JSON 对象或数组。`
    };
  }

  const validationError = validateDashboardJsonValue(value, label);
  if (validationError) {
    return {
      ok: false,
      message: validationError
    };
  }

  if (label === 'config') {
    const normalizedTimeRangeConfig = normalizeDashboardConfigTimeRange(value);
    if (!normalizedTimeRangeConfig.ok) {
      return normalizedTimeRangeConfig;
    }

    const normalizedPanelConfig = normalizeDashboardConfigPanels(normalizedTimeRangeConfig.value);
    if (!normalizedPanelConfig.ok) {
      return normalizedPanelConfig;
    }

    const normalizedVariableConfig = normalizeDashboardConfigVariables(normalizedPanelConfig.value);
    if (!normalizedVariableConfig.ok) {
      return normalizedVariableConfig;
    }

    return {
      ok: true,
      value: normalizedVariableConfig.value
    };
  }

  return {
    ok: true,
    value
  };
}

function getDashboardImportForbiddenFields(value: Record<string, unknown>) {
  const forbiddenFields = [
    'id',
    'project_id',
    'created_by_user_id',
    'updated_by_user_id',
    'created_at',
    'updated_at'
  ];

  return forbiddenFields.filter((field) => field in value);
}

function normalizeImportName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name.length > 0 && name.length <= 100 ? name : null;
}

function normalizeImportDescription(value: unknown):
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
      message: string;
    } {
  if (value === null) {
    return {
      ok: true,
      value: null
    };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      message: '导入文档 description 必须是字符串或 null。'
    };
  }

  const description = value.trim();
  if (description.length > 500) {
    return {
      ok: false,
      message: '导入文档 description 不能超过 500 字符。'
    };
  }

  return {
    ok: true,
    value: description.length > 0 ? description : null
  };
}

function validateDashboardJsonValue(value: DashboardJson, label: string) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodesSeen = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    nodesSeen += 1;
    if (nodesSeen > DASHBOARD_JSON_MAX_NODES) {
      return `${label} 复杂度不能超过 ${DASHBOARD_JSON_MAX_NODES} 个节点。`;
    }

    if (current.depth > DASHBOARD_JSON_MAX_DEPTH) {
      return `${label} 嵌套深度不能超过 ${DASHBOARD_JSON_MAX_DEPTH}。`;
    }

    if (typeof current.value === 'number' && !Number.isFinite(current.value)) {
      return `${label} 不能包含 NaN 或 Infinity。`;
    }

    if (Array.isArray(current.value)) {
      for (const item of current.value) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }

    if (current.value && typeof current.value === 'object') {
      for (const item of Object.values(current.value as Record<string, unknown>)) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
    }
  }

  const serialized = JSON.stringify(value);
  if (!serialized) {
    return `${label} 必须是可序列化 JSON。`;
  }

  if (jsonTextSizeBytes(serialized) > DASHBOARD_JSON_MAX_BYTES) {
    return `${label} 不能超过 ${DASHBOARD_JSON_MAX_BYTES} 字节。`;
  }

  return null;
}

function jsonTextSizeBytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function containsNonFiniteJsonToken(value: string) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (
      matchesBareToken(value, index, 'NaN') ||
      matchesBareToken(value, index, 'Infinity') ||
      matchesBareToken(value, index, '-Infinity')
    ) {
      return true;
    }
  }

  return false;
}

function matchesBareToken(value: string, index: number, token: string) {
  if (!value.startsWith(token, index)) {
    return false;
  }

  const previous = index > 0 ? value[index - 1] : '';
  const next = value[index + token.length] ?? '';

  return !isIdentifierCharacter(previous) && !isIdentifierCharacter(next);
}

function isIdentifierCharacter(value: string) {
  return /^[A-Za-z0-9_$]$/.test(value);
}
