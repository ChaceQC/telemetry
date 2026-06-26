import {
  ALERT_SEVERITIES,
  ALERT_SIGNALS,
  type AlertRule,
  type AlertRuleJson,
  type AlertSeverity,
  type AlertSignal,
  type CreateAlertRuleRequest,
  type UpdateAlertRuleRequest
} from '../../api/alerts';

export const ALERT_JSON_MAX_BYTES = 16 * 1024;
export const ALERT_JSON_MAX_DEPTH = 16;
export const ALERT_JSON_MAX_NODES = 1024;
export const ALERT_JSON_TEXT_MAX_LENGTH = ALERT_JSON_MAX_BYTES;
export const ALERT_EVALUATION_SECONDS_MIN = 1;
export const ALERT_EVALUATION_SECONDS_MAX = 86_400;

export type AlertRuleFormState = {
  projectId: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: AlertSeverity;
  signal: AlertSignal;
  conditionText: string;
  evaluationText: string;
};

type BuildResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      message: string;
    };

const DEFAULT_ALERT_CONDITION: AlertRuleJson = {
  metric: 'http.server.errors',
  operator: 'gt',
  threshold: 3
};

const DEFAULT_ALERT_EVALUATION: AlertRuleJson = {
  window_seconds: 300,
  interval_seconds: 60
};

export function createDefaultAlertRuleForm(projectId = ''): AlertRuleFormState {
  return {
    projectId,
    name: '',
    description: '',
    enabled: true,
    severity: 'warning',
    signal: 'metrics',
    conditionText: formatAlertRuleJson(DEFAULT_ALERT_CONDITION),
    evaluationText: formatAlertRuleJson(DEFAULT_ALERT_EVALUATION)
  };
}

export function alertRuleToForm(rule: AlertRule | null): AlertRuleFormState {
  if (!rule) {
    return createDefaultAlertRuleForm();
  }

  return {
    projectId: `${rule.project_id}`,
    name: rule.name,
    description: rule.description ?? '',
    enabled: rule.enabled,
    severity: rule.severity,
    signal: rule.signal,
    conditionText: formatAlertRuleJson(rule.condition),
    evaluationText: formatAlertRuleJson(rule.evaluation)
  };
}

export function formatAlertRuleJson(value: AlertRuleJson | undefined) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function normalizePositiveInteger(value: string) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function buildCreateAlertRulePayload(form: AlertRuleFormState): BuildResult<CreateAlertRuleRequest> {
  const projectId = normalizePositiveInteger(form.projectId);
  if (!projectId) {
    return {
      ok: false,
      message: '项目 ID 必须是正整数。'
    };
  }

  const base = buildAlertRuleBasePayload(form);
  if (!base.ok) {
    return base;
  }

  return {
    ok: true,
    value: {
      project_id: projectId,
      ...base.value
    }
  };
}

export function buildUpdateAlertRulePayload(rule: AlertRule, form: AlertRuleFormState): BuildResult<UpdateAlertRuleRequest> {
  const base = buildAlertRuleBasePayload(form);
  if (!base.ok) {
    return base;
  }

  const changedPayload: UpdateAlertRuleRequest = {};
  if (base.value.name !== rule.name) {
    changedPayload.name = base.value.name;
  }
  if (base.value.description !== normalizeOptionalText(rule.description ?? '')) {
    changedPayload.description = base.value.description;
  }
  if (base.value.enabled !== rule.enabled) {
    changedPayload.enabled = base.value.enabled;
  }
  if (base.value.severity !== rule.severity) {
    changedPayload.severity = base.value.severity;
  }
  if (base.value.signal !== rule.signal) {
    changedPayload.signal = base.value.signal;
  }
  if (JSON.stringify(base.value.condition) !== JSON.stringify(rule.condition)) {
    changedPayload.condition = base.value.condition;
  }
  if (JSON.stringify(base.value.evaluation) !== JSON.stringify(rule.evaluation)) {
    changedPayload.evaluation = base.value.evaluation;
  }

  if (Object.keys(changedPayload).length === 0) {
    return {
      ok: false,
      message: '至少修改一个字段后再保存。'
    };
  }

  return {
    ok: true,
    value: changedPayload
  };
}

export function buildToggleAlertRulePayload(enabled: boolean): UpdateAlertRuleRequest {
  return { enabled };
}

function buildAlertRuleBasePayload(
  form: AlertRuleFormState
): BuildResult<Omit<CreateAlertRuleRequest, 'project_id'>> {
  const name = form.name.trim();
  if (name.length < 1 || name.length > 100) {
    return {
      ok: false,
      message: '名称必须是 1 到 100 个字符。'
    };
  }

  const description = normalizeOptionalText(form.description);
  if ((description?.length ?? 0) > 500) {
    return {
      ok: false,
      message: '描述不能超过 500 个字符。'
    };
  }

  if (!isAlertSeverity(form.severity)) {
    return {
      ok: false,
      message: 'severity 必须是 info、warning 或 critical。'
    };
  }

  if (!isAlertSignal(form.signal)) {
    return {
      ok: false,
      message: 'signal 必须是 metrics、logs、traces 或 events。'
    };
  }

  const condition = parseAlertRuleJsonField(form.conditionText, 'condition');
  if (!condition.ok) {
    return condition;
  }

  const evaluation = parseAlertRuleJsonField(form.evaluationText, 'evaluation');
  if (!evaluation.ok) {
    return evaluation;
  }

  const evaluationShapeError = validateEvaluationWindow(evaluation.value);
  if (evaluationShapeError) {
    return {
      ok: false,
      message: evaluationShapeError
    };
  }

  return {
    ok: true,
    value: {
      name,
      description,
      enabled: form.enabled,
      severity: form.severity,
      signal: form.signal,
      condition: condition.value,
      evaluation: evaluation.value
    }
  };
}

function parseAlertRuleJsonField(value: string, label: 'condition' | 'evaluation'): BuildResult<AlertRuleJson> {
  if (!value.trim()) {
    return {
      ok: false,
      message: `${label} 不能为空。`
    };
  }

  if (containsNonFiniteJsonToken(value)) {
    return {
      ok: false,
      message: `${label} 不能包含 NaN 或 Infinity。`
    };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isPlainJsonObject(parsed)) {
      return {
        ok: false,
        message: `${label} 必须是非空 JSON 对象。`
      };
    }

    if (Object.keys(parsed).length === 0) {
      return {
        ok: false,
        message: `${label} 必须是非空 JSON 对象。`
      };
    }

    const validationError = validateAlertJsonValue(parsed, label);
    if (validationError) {
      return {
        ok: false,
        message: validationError
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

function validateAlertJsonValue(value: AlertRuleJson, label: string) {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodesSeen = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    nodesSeen += 1;
    if (nodesSeen > ALERT_JSON_MAX_NODES) {
      return `${label} 复杂度不能超过 ${ALERT_JSON_MAX_NODES} 个节点。`;
    }

    if (current.depth > ALERT_JSON_MAX_DEPTH) {
      return `${label} 嵌套深度不能超过 ${ALERT_JSON_MAX_DEPTH}。`;
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

  if (jsonTextSizeBytes(serialized) > ALERT_JSON_MAX_BYTES) {
    return `${label} 不能超过 ${ALERT_JSON_MAX_BYTES} 字节。`;
  }

  return null;
}

function validateEvaluationWindow(evaluation: AlertRuleJson) {
  const windowSeconds = evaluation.window_seconds;
  const intervalSeconds = evaluation.interval_seconds;

  if (!isEvaluationSeconds(windowSeconds)) {
    return 'evaluation.window_seconds 必须是 1..86400 的整数。';
  }

  if (!isEvaluationSeconds(intervalSeconds)) {
    return 'evaluation.interval_seconds 必须是 1..86400 的整数。';
  }

  return null;
}

function isEvaluationSeconds(value: unknown) {
  return (
    Number.isInteger(value) &&
    Number(value) >= ALERT_EVALUATION_SECONDS_MIN &&
    Number(value) <= ALERT_EVALUATION_SECONDS_MAX
  );
}

function normalizeOptionalText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isPlainJsonObject(value: unknown): value is AlertRuleJson {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAlertSignal(value: string): value is AlertSignal {
  return ALERT_SIGNALS.includes(value as AlertSignal);
}

function isAlertSeverity(value: string): value is AlertSeverity {
  return ALERT_SEVERITIES.includes(value as AlertSeverity);
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
