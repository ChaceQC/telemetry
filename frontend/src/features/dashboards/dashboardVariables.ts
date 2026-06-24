import type { DashboardJson } from '../../api/dashboards';

export const DASHBOARD_VARIABLE_TYPES = ['text', 'number', 'select'] as const;
export const DASHBOARD_VARIABLE_NAME_MAX_LENGTH = 64;
export const DASHBOARD_VARIABLE_LABEL_MAX_LENGTH = 120;
export const DASHBOARD_VARIABLE_TYPE_MAX_LENGTH = 32;
export const DASHBOARD_VARIABLE_VALUE_MAX_LENGTH = 256;

export type DashboardVariableType = (typeof DASHBOARD_VARIABLE_TYPES)[number];

export type DashboardVariable = Record<string, unknown> & {
  name: string;
  type: DashboardVariableType;
  label?: string;
  default?: string | number;
  options?: string[];
};

export type DashboardVariableDraft = {
  mode: 'create' | 'edit';
  editIndex: number | null;
  originalVariableName: string | null;
  name: string;
  label: string;
  type: DashboardVariableType;
  hasDefault: boolean;
  defaultValue: string;
  optionsText: string;
};

export type DashboardVariablesReadResult =
  | {
      ok: true;
      config: Record<string, unknown>;
      variables: DashboardVariable[];
      hasVariables: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type DashboardVariablesParseResult =
  | {
      ok: true;
      config: Record<string, unknown>;
      rawVariables: unknown[];
      variables: DashboardVariable[];
      hasVariables: boolean;
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

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateDashboardConfigVariables(config: DashboardJson) {
  const normalized = normalizeDashboardConfigVariables(config);
  return normalized.ok ? null : normalized.message;
}

export function normalizeDashboardConfigVariables(config: DashboardJson): ValidationResult<DashboardJson> {
  if (!isRecord(config) || !('variables' in config)) {
    return {
      ok: true,
      value: config
    };
  }

  const variables = config.variables;
  if (!Array.isArray(variables)) {
    return {
      ok: false,
      message: 'config.variables 必须是数组。'
    };
  }

  const normalized = normalizeDashboardVariableCollection(variables, 'config.variables');
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    value: {
      ...config,
      variables: normalized.value
    }
  };
}

export function readDashboardVariablesFromConfigText(configText: string): DashboardVariablesReadResult {
  const parsed = parseDashboardConfigForVariables(configText);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    config: parsed.config,
    variables: parsed.variables,
    hasVariables: parsed.hasVariables
  };
}

export function createDefaultDashboardVariableDraft(
  variables: Array<Pick<DashboardVariable, 'name'>> = []
): DashboardVariableDraft {
  return {
    mode: 'create',
    editIndex: null,
    originalVariableName: null,
    name: resolveNextVariableName(variables),
    label: '',
    type: 'text',
    hasDefault: false,
    defaultValue: '',
    optionsText: ''
  };
}

export function dashboardVariableToDraft(variable: DashboardVariable, index: number): DashboardVariableDraft {
  const hasDefault = Object.prototype.hasOwnProperty.call(variable, 'default');

  return {
    mode: 'edit',
    editIndex: index,
    originalVariableName: variable.name,
    name: variable.name,
    label: variable.label ?? '',
    type: variable.type,
    hasDefault,
    defaultValue: hasDefault ? `${variable.default ?? ''}` : '',
    optionsText: variable.options?.join('\n') ?? ''
  };
}

export function upsertDashboardVariableInConfigText(configText: string, draft: DashboardVariableDraft) {
  const parsed = parseDashboardConfigForVariables(configText);
  if (!parsed.ok) {
    return parsed;
  }

  const draftVariable = dashboardVariableDraftToVariable(draft);
  if (!draftVariable.ok) {
    return draftVariable;
  }

  const nextVariables = [...parsed.rawVariables];
  if (draft.mode === 'edit') {
    if (draft.editIndex === null || draft.editIndex < 0) {
      return {
        ok: false as const,
        message: '请选择要更新的变量。'
      };
    }
    if (
      draft.originalVariableName === null ||
      draft.editIndex >= nextVariables.length ||
      parsed.variables[draft.editIndex]?.name !== draft.originalVariableName.trim()
    ) {
      return {
        ok: false as const,
        message: '当前 config.variables 已变化，请重新选择要更新的变量。'
      };
    }
    nextVariables[draft.editIndex] = draftVariable.value;
  } else {
    nextVariables.push(draftVariable.value);
  }

  return buildConfigWithVariables(parsed.config, nextVariables);
}

export function removeDashboardVariableFromConfigText(configText: string, index: number) {
  const parsed = parseDashboardConfigForVariables(configText);
  if (!parsed.ok) {
    return parsed;
  }

  if (index < 0 || index >= parsed.rawVariables.length) {
    return {
      ok: false as const,
      message: '请选择要删除的变量。'
    };
  }

  const nextVariables = parsed.rawVariables.filter((_, variableIndex) => variableIndex !== index);
  return buildConfigWithVariables(parsed.config, nextVariables);
}

export function formatDashboardVariableOptions(options: string[] | undefined) {
  return options?.join(', ') ?? '';
}

function parseDashboardConfigForVariables(configText: string): DashboardVariablesParseResult {
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
      message: 'config 必须是 JSON 对象才能使用 variables。'
    };
  }

  if (!('variables' in parsed)) {
    return {
      ok: true,
      config: parsed,
      rawVariables: [],
      variables: [],
      hasVariables: false
    };
  }

  if (!Array.isArray(parsed.variables)) {
    return {
      ok: false,
      message: 'config.variables 必须是数组。'
    };
  }

  const normalized = normalizeDashboardVariableCollection(parsed.variables, 'config.variables');
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    config: parsed,
    rawVariables: parsed.variables,
    variables: normalized.value,
    hasVariables: true
  };
}

function buildConfigWithVariables(config: Record<string, unknown>, rawVariables: unknown[]) {
  const normalized = normalizeDashboardVariableCollection(rawVariables, 'config.variables');
  if (!normalized.ok) {
    return normalized;
  }

  const nextConfig = {
    ...config,
    variables: normalized.value
  };

  return {
    ok: true as const,
    value: nextConfig,
    configText: formatDashboardVariablesJson(nextConfig)
  };
}

function dashboardVariableDraftToVariable(draft: DashboardVariableDraft): ValidationResult<DashboardVariable> {
  const name = normalizeVariableName(draft.name, 'variable.name');
  if (!name.ok) {
    return name;
  }

  const type = normalizeVariableType(draft.type, 'variable.type');
  if (!type.ok) {
    return type;
  }

  const label = parseOptionalNonEmptyDraftString(draft.label, 'variable.label', DASHBOARD_VARIABLE_LABEL_MAX_LENGTH);
  if (!label.ok) {
    return label;
  }

  const variable: DashboardVariable = {
    name: name.value,
    type: type.value
  };

  if (label.value !== undefined) {
    variable.label = label.value;
  }

  if (type.value === 'select') {
    const options = parseOptionsText(draft.optionsText, 'variable.options');
    if (!options.ok) {
      return options;
    }
    variable.options = options.value;

    if (shouldWriteDraftDefault(draft)) {
      const defaultValue = parseTrimmedDraftString(draft.defaultValue, 'variable.default', DASHBOARD_VARIABLE_VALUE_MAX_LENGTH);
      if (!defaultValue.ok) {
        return defaultValue;
      }
      if (!options.value.includes(defaultValue.value)) {
        return {
          ok: false,
          message: 'variable.default 必须匹配 options 中的一个值。'
        };
      }
      variable.default = defaultValue.value;
    }
    return {
      ok: true,
      value: variable
    };
  }

  if (draft.optionsText.trim().length > 0) {
    return {
      ok: false,
      message: 'variable.options 仅支持 select 类型变量。'
    };
  }

  if (type.value === 'number') {
    if (shouldWriteDraftDefault(draft)) {
      const defaultValue = parseRequiredFiniteNumber(draft.defaultValue, 'variable.default');
      if (!defaultValue.ok) {
        return defaultValue;
      }
      variable.default = defaultValue.value;
    }
  } else {
    if (shouldWriteDraftDefault(draft)) {
      const defaultValue = parseTrimmedDraftString(draft.defaultValue, 'variable.default', DASHBOARD_VARIABLE_VALUE_MAX_LENGTH);
      if (!defaultValue.ok) {
        return defaultValue;
      }
      variable.default = defaultValue.value;
    }
  }

  return {
    ok: true,
    value: variable
  };
}

function normalizeDashboardVariableCollection(variables: unknown[], fieldPath: string): ValidationResult<DashboardVariable[]> {
  const normalizedVariables: DashboardVariable[] = [];
  const seenNames = new Set<string>();

  for (let index = 0; index < variables.length; index += 1) {
    const variablePath = `${fieldPath}[${index}]`;
    const variable = normalizeDashboardVariable(variables[index], variablePath);
    if (!variable.ok) {
      return variable;
    }

    if (seenNames.has(variable.value.name)) {
      return {
        ok: false,
        message: `${variablePath}.name 不能重复。`
      };
    }
    seenNames.add(variable.value.name);
    normalizedVariables.push(variable.value);
  }

  return {
    ok: true,
    value: normalizedVariables
  };
}

function normalizeDashboardVariable(value: unknown, fieldPath: string): ValidationResult<DashboardVariable> {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是 JSON 对象。`
    };
  }

  const name = getRequiredVariableName(value, 'name', fieldPath);
  if (!name.ok) {
    return name;
  }

  const label = normalizeOptionalNonEmptyUnknownString(
    value,
    'label',
    `${fieldPath}.label`,
    DASHBOARD_VARIABLE_LABEL_MAX_LENGTH
  );
  if (!label.ok) {
    return label;
  }

  const type = getRequiredVariableType(value, 'type', fieldPath);
  if (!type.ok) {
    return type;
  }

  const normalizedVariable: DashboardVariable = {
    ...value,
    name: name.value,
    type: type.value
  };
  if (label.value !== undefined) {
    normalizedVariable.label = label.value;
  }

  if (type.value === 'text') {
    if ('options' in value) {
      return {
        ok: false,
        message: `${fieldPath}.options 仅支持 select 类型变量。`
      };
    }
    const defaultValue = normalizeOptionalTrimmedUnknownString(
      value,
      'default',
      `${fieldPath}.default`,
      DASHBOARD_VARIABLE_VALUE_MAX_LENGTH
    );
    if (!defaultValue.ok) {
      return defaultValue;
    }
    if (defaultValue.value !== undefined) {
      normalizedVariable.default = defaultValue.value;
    }
  } else if (type.value === 'number') {
    if ('options' in value) {
      return {
        ok: false,
        message: `${fieldPath}.options 仅支持 select 类型变量。`
      };
    }
    if ('default' in value) {
      const defaultValue = normalizeFiniteNumber(value.default, `${fieldPath}.default`);
      if (!defaultValue.ok) {
        return defaultValue;
      }
      normalizedVariable.default = defaultValue.value;
    }
  } else {
    const options = normalizeSelectOptions(value.options, `${fieldPath}.options`);
    if (!options.ok) {
      return options;
    }
    normalizedVariable.options = options.value;

    const defaultValue = normalizeOptionalTrimmedUnknownString(
      value,
      'default',
      `${fieldPath}.default`,
      DASHBOARD_VARIABLE_VALUE_MAX_LENGTH
    );
    if (!defaultValue.ok) {
      return defaultValue;
    }
    if (defaultValue.value !== undefined) {
      if (!options.value.includes(defaultValue.value)) {
        return {
          ok: false,
          message: `${fieldPath}.default 必须匹配 options 中的一个值。`
        };
      }
      normalizedVariable.default = defaultValue.value;
    }
  }

  return {
    ok: true,
    value: normalizedVariable
  };
}

function normalizeVariableName(value: unknown, fieldPath: string): ValidationResult<string> {
  const name = normalizeRequiredString(value, fieldPath, DASHBOARD_VARIABLE_NAME_MAX_LENGTH);
  if (!name.ok) {
    return name;
  }

  if (!VARIABLE_NAME_PATTERN.test(name.value)) {
    return {
      ok: false,
      message: `${fieldPath} 只能包含字母、数字和下划线，且不能以数字开头。`
    };
  }

  return name;
}

function normalizeVariableType(value: unknown, fieldPath: string): ValidationResult<DashboardVariableType> {
  const type = normalizeRequiredString(value, fieldPath, DASHBOARD_VARIABLE_TYPE_MAX_LENGTH);
  if (!type.ok) {
    return type;
  }

  if (!isDashboardVariableType(type.value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是 text/number/select 之一。`
    };
  }

  return {
    ok: true,
    value: type.value
  };
}

function shouldWriteDraftDefault(draft: DashboardVariableDraft) {
  return draft.hasDefault || draft.defaultValue.trim().length > 0;
}

function getRequiredVariableName(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string
): ValidationResult<string> {
  if (!(key in mapping)) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 为必填字段。`
    };
  }

  return normalizeVariableName(mapping[key], `${fieldPath}.${key}`);
}

function getRequiredVariableType(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string
): ValidationResult<DashboardVariableType> {
  if (!(key in mapping)) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 为必填字段。`
    };
  }

  return normalizeVariableType(mapping[key], `${fieldPath}.${key}`);
}

function normalizeRequiredString(value: unknown, fieldPath: string, maxLength: number): ValidationResult<string> {
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${fieldPath} 必须是字符串。`
    };
  }

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

function normalizeOptionalNonEmptyUnknownString(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string,
  maxLength: number
): ValidationResult<string | undefined> {
  if (!(key in mapping)) {
    return {
      ok: true,
      value: undefined
    };
  }

  return normalizeOptionalNonEmptyString(mapping[key], fieldPath, maxLength);
}

function normalizeOptionalNonEmptyString(
  value: unknown,
  fieldPath: string,
  maxLength: number
): ValidationResult<string | undefined> {
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${fieldPath} 必须是字符串。`
    };
  }

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

function parseOptionalNonEmptyDraftString(
  value: string,
  fieldPath: string,
  maxLength: number
): ValidationResult<string | undefined> {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return {
      ok: true,
      value: undefined
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

function normalizeOptionalTrimmedUnknownString(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string,
  maxLength: number
): ValidationResult<string | undefined> {
  if (!(key in mapping)) {
    return {
      ok: true,
      value: undefined
    };
  }

  return normalizeOptionalTrimmedString(mapping[key], fieldPath, maxLength);
}

function parseTrimmedDraftString(value: string, fieldPath: string, maxLength: number): ValidationResult<string> {
  const trimmedValue = value.trim();
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

function normalizeOptionalTrimmedString(
  value: unknown,
  fieldPath: string,
  maxLength: number
): ValidationResult<string | undefined> {
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${fieldPath} 必须是字符串。`
    };
  }

  const trimmedValue = value.trim();
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

function normalizeFiniteNumber(value: unknown, fieldPath: string): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是有限数字。`
    };
  }

  return {
    ok: true,
    value
  };
}

function parseRequiredFiniteNumber(value: string, fieldPath: string): ValidationResult<number> {
  if (value.trim().length === 0) {
    return {
      ok: false,
      message: `${fieldPath} 必须是有限数字。`
    };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是有限数字。`
    };
  }

  return {
    ok: true,
    value: numericValue
  };
}

function normalizeSelectOptions(value: unknown, fieldPath: string): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: `${fieldPath} 必须是数组。`
    };
  }

  if (value.length === 0) {
    return {
      ok: false,
      message: `${fieldPath} 不能为空。`
    };
  }

  const options: string[] = [];
  const seenOptions = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const option = normalizeRequiredString(value[index], `${fieldPath}[${index}]`, DASHBOARD_VARIABLE_VALUE_MAX_LENGTH);
    if (!option.ok) {
      return option;
    }

    if (seenOptions.has(option.value)) {
      return {
        ok: false,
        message: `${fieldPath}[${index}] 不能重复。`
      };
    }
    seenOptions.add(option.value);
    options.push(option.value);
  }

  return {
    ok: true,
    value: options
  };
}

function parseOptionsText(value: string, fieldPath: string): ValidationResult<string[]> {
  const rawOptions = value
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean);
  const options: string[] = [];
  const seenOptions = new Set<string>();

  for (let index = 0; index < rawOptions.length; index += 1) {
    const option = rawOptions[index];
    if (option.length > DASHBOARD_VARIABLE_VALUE_MAX_LENGTH) {
      return {
        ok: false,
        message: `${fieldPath}[${index}] 不能超过 ${DASHBOARD_VARIABLE_VALUE_MAX_LENGTH} 字符。`
      };
    }
    if (seenOptions.has(option)) {
      continue;
    }
    seenOptions.add(option);
    options.push(option);
  }

  if (options.length === 0) {
    return {
      ok: false,
      message: `${fieldPath} 不能为空。`
    };
  }

  return {
    ok: true,
    value: options
  };
}

function resolveNextVariableName(variables: Array<Pick<DashboardVariable, 'name'>>) {
  const names = new Set(variables.map((variable) => variable.name));
  if (!names.has('env')) {
    return 'env';
  }

  let index = 2;
  while (names.has(`var_${index}`)) {
    index += 1;
  }

  return `var_${index}`;
}

function isDashboardVariableType(value: string): value is DashboardVariableType {
  return DASHBOARD_VARIABLE_TYPES.includes(value as DashboardVariableType);
}

function formatDashboardVariablesJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
