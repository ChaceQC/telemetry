import type { DashboardJson } from '../../api/dashboards';

export const DASHBOARD_TIME_RANGE_RELATIVES = ['15m', '1h', '6h', '24h', '7d'] as const;
export const DEFAULT_DASHBOARD_TIME_RANGE_RELATIVE: DashboardRelativeTimeRange = '1h';

export type DashboardRelativeTimeRange = (typeof DASHBOARD_TIME_RANGE_RELATIVES)[number];

export type DashboardTimeRangeDraft = {
  mode: 'none' | 'relative' | 'absolute';
  relative: string;
  from: string;
  to: string;
};

export type DashboardTimeRangeReadResult =
  | {
      ok: true;
      editable: true;
      state: 'missing' | 'relative' | 'absolute';
      statusLabel: string;
      message: string;
      draft: DashboardTimeRangeDraft;
    }
  | {
      ok: false;
      editable: boolean;
      state: 'invalid-json' | 'not-object' | 'invalid-time-range';
      statusLabel: string;
      message: string;
      draft: DashboardTimeRangeDraft;
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

export function createDefaultDashboardTimeRangeDraft(
  overrides: Partial<DashboardTimeRangeDraft> = {}
): DashboardTimeRangeDraft {
  return {
    mode: 'none',
    relative: DEFAULT_DASHBOARD_TIME_RANGE_RELATIVE,
    from: '',
    to: '',
    ...overrides
  };
}

export function validateDashboardConfigTimeRange(config: DashboardJson) {
  const normalized = normalizeDashboardConfigTimeRange(config);
  return normalized.ok ? null : normalized.message;
}

export function normalizeDashboardConfigTimeRange(config: DashboardJson): ValidationResult<DashboardJson> {
  if (!isRecord(config) || !('time_range' in config)) {
    return {
      ok: true,
      value: config
    };
  }

  const normalized = normalizeDashboardTimeRange(config.time_range);
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    value: {
      ...config,
      time_range: normalized.value
    }
  };
}

export function readDashboardTimeRangeFromConfigText(configText: string): DashboardTimeRangeReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch {
    return {
      ok: false,
      editable: false,
      state: 'invalid-json',
      statusLabel: '配置错误',
      message: 'config 不是有效 JSON。',
      draft: createDefaultDashboardTimeRangeDraft()
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      editable: false,
      state: 'not-object',
      statusLabel: '不可编辑',
      message: 'config 必须是 JSON 对象才能使用 time_range。',
      draft: createDefaultDashboardTimeRangeDraft()
    };
  }

  if (!('time_range' in parsed)) {
    return {
      ok: true,
      editable: true,
      state: 'missing',
      statusLabel: '未配置',
      message: '当前 config 未包含全局时间范围。',
      draft: createDefaultDashboardTimeRangeDraft()
    };
  }

  const draft = dashboardTimeRangeToDraft(parsed.time_range);
  const normalized = normalizeDashboardTimeRange(parsed.time_range);
  if (!normalized.ok) {
    return {
      ok: false,
      editable: true,
      state: 'invalid-time-range',
      statusLabel: '配置错误',
      message: normalized.message,
      draft
    };
  }

  if (normalized.value.mode === 'relative') {
    return {
      ok: true,
      editable: true,
      state: 'relative',
      statusLabel: formatRelativeTimeRangeLabel(normalized.value.relative),
      message: `最近 ${formatRelativeTimeRangeText(normalized.value.relative)}。`,
      draft: dashboardTimeRangeToDraft(normalized.value)
    };
  }

  return {
    ok: true,
    editable: true,
    state: 'absolute',
    statusLabel: '绝对范围',
    message: `${normalized.value.from} - ${normalized.value.to}`,
    draft: dashboardTimeRangeToDraft(normalized.value)
  };
}

export function writeDashboardTimeRangeToConfigText(configText: string, draft: DashboardTimeRangeDraft) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch {
    return {
      ok: false as const,
      message: 'config 不是有效 JSON。'
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false as const,
      message: 'config 必须是 JSON 对象才能使用 time_range。'
    };
  }

  const nextConfig = { ...parsed };
  if (draft.mode === 'none') {
    delete nextConfig.time_range;
  } else if (draft.mode === 'relative') {
    const relative = normalizeRelativeTimeRangeValue(draft.relative);
    if (!relative.ok) {
      return relative;
    }
    nextConfig.time_range = {
      mode: 'relative',
      relative: relative.value
    };
  } else {
    const absolute = normalizeAbsoluteTimeRange({
      mode: 'absolute',
      from: draft.from,
      to: draft.to
    });
    if (!absolute.ok) {
      return absolute;
    }
    nextConfig.time_range = absolute.value;
  }

  return {
    ok: true as const,
    value: nextConfig,
    configText: formatDashboardTimeRangeJson(nextConfig)
  };
}

export function isDashboardRelativeTimeRange(value: string): value is DashboardRelativeTimeRange {
  return DASHBOARD_TIME_RANGE_RELATIVES.includes(value as DashboardRelativeTimeRange);
}

function normalizeDashboardTimeRange(value: unknown) {
  if (!isRecord(value)) {
    return {
      ok: false as const,
      message: 'config.time_range 必须是 JSON 对象。'
    };
  }

  const mode = requireTrimmedString(value, 'mode', 'config.time_range', 'absolute'.length);
  if (!mode.ok) {
    return mode;
  }

  if (mode.value === 'relative') {
    return normalizeRelativeTimeRange(value);
  }

  if (mode.value === 'absolute') {
    return normalizeAbsoluteTimeRange(value);
  }

  return {
    ok: false as const,
    message: 'config.time_range.mode 必须是 relative/absolute 之一。'
  };
}

function normalizeRelativeTimeRange(timeRange: Record<string, unknown>) {
  const relative = requireTrimmedString(
    timeRange,
    'relative',
    'config.time_range',
    Math.max(...DASHBOARD_TIME_RANGE_RELATIVES.map((value) => value.length))
  );
  if (!relative.ok) {
    return relative;
  }

  const normalizedRelative = normalizeRelativeTimeRangeValue(relative.value);
  if (!normalizedRelative.ok) {
    return normalizedRelative;
  }

  return {
    ok: true as const,
    value: {
      ...timeRange,
      mode: 'relative' as const,
      relative: normalizedRelative.value
    }
  };
}

function normalizeAbsoluteTimeRange(timeRange: Record<string, unknown>) {
  const from = requireTrimmedString(timeRange, 'from', 'config.time_range');
  if (!from.ok) {
    return from;
  }

  const to = requireTrimmedString(timeRange, 'to', 'config.time_range');
  if (!to.ok) {
    return to;
  }

  const fromTime = parseComparableIsoTime(from.value, 'config.time_range.from');
  if (!fromTime.ok) {
    return fromTime;
  }

  const toTime = parseComparableIsoTime(to.value, 'config.time_range.to');
  if (!toTime.ok) {
    return toTime;
  }

  if (fromTime.hasTimezone !== toTime.hasTimezone) {
    return {
      ok: false as const,
      message: 'config.time_range.from/to 必须使用可比较的 ISO 8601 时间字符串。'
    };
  }

  if (fromTime.value >= toTime.value) {
    return {
      ok: false as const,
      message: 'config.time_range.from 必须早于 config.time_range.to。'
    };
  }

  return {
    ok: true as const,
    value: {
      ...timeRange,
      mode: 'absolute' as const,
      from: from.value,
      to: to.value
    }
  };
}

function normalizeRelativeTimeRangeValue(value: string): ValidationResult<DashboardRelativeTimeRange> {
  const relative = value.trim();
  if (!isDashboardRelativeTimeRange(relative)) {
    return {
      ok: false,
      message: 'config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一。'
    };
  }

  return {
    ok: true,
    value: relative
  };
}

function requireTrimmedString(
  mapping: Record<string, unknown>,
  key: string,
  fieldPath: string,
  maxLength?: number
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

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 不能为空。`
    };
  }

  if (maxLength !== undefined && trimmedValue.length > maxLength) {
    return {
      ok: false,
      message: `${fieldPath}.${key} 不能超过 ${maxLength} 字符。`
    };
  }

  return {
    ok: true,
    value: trimmedValue
  };
}

function parseComparableIsoTime(value: string, fieldPath: string) {
  const parts = parseIsoDateTimeParts(value);
  if (!parts.ok) {
    return {
      ok: false as const,
      message: `${fieldPath} 必须是 ISO 8601 时间字符串。`
    };
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !matchesParsedUtcParts(timestamp, parts.value)) {
    return {
      ok: false as const,
      message: `${fieldPath} 必须是 ISO 8601 时间字符串。`
    };
  }

  return {
    ok: true as const,
    value: timestamp,
    hasTimezone: hasIsoTimezone(value)
  };
}

type IsoDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  timezoneOffsetMinutes: number | null;
};

function parseIsoDateTimeParts(value: string): ValidationResult<IsoDateTimeParts> {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<timezone>Z|[+-]\d{2}:\d{2})?$/i.exec(
      value
    );

  if (!match?.groups) {
    return {
      ok: false,
      message: 'invalid ISO date time'
    };
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const millisecond = Number((match.groups.fraction ?? '').padEnd(3, '0').slice(0, 3));
  const timezoneOffsetMinutes = parseIsoTimezoneOffsetMinutes(match.groups.timezone);

  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    timezoneOffsetMinutes === false
  ) {
    return {
      ok: false,
      message: 'invalid ISO date time'
    };
  }

  return {
    ok: true,
    value: {
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond,
      timezoneOffsetMinutes
    }
  };
}

function parseIsoTimezoneOffsetMinutes(value: string | undefined): number | null | false {
  if (!value) {
    return null;
  }

  if (value.toUpperCase() === 'Z') {
    return 0;
  }

  const sign = value.startsWith('-') ? -1 : 1;
  const hours = Number(value.slice(1, 3));
  const minutes = Number(value.slice(4, 6));
  if (hours > 23 || minutes > 59) {
    return false;
  }

  return sign * (hours * 60 + minutes);
}

function matchesParsedUtcParts(timestamp: number, parts: IsoDateTimeParts) {
  if (parts.timezoneOffsetMinutes === null) {
    const parsed = new Date(timestamp);
    return (
      parsed.getFullYear() === parts.year &&
      parsed.getMonth() === parts.month - 1 &&
      parsed.getDate() === parts.day &&
      parsed.getHours() === parts.hour &&
      parsed.getMinutes() === parts.minute &&
      parsed.getSeconds() === parts.second &&
      parsed.getMilliseconds() === parts.millisecond
    );
  }

  const expectedTimestamp = createUtcTimestamp(parts) - parts.timezoneOffsetMinutes * 60_000;

  if (expectedTimestamp !== timestamp) {
    return false;
  }

  const parsed = new Date(expectedTimestamp + parts.timezoneOffsetMinutes * 60_000);
  return (
    parsed.getUTCFullYear() === parts.year &&
    parsed.getUTCMonth() === parts.month - 1 &&
    parsed.getUTCDate() === parts.day &&
    parsed.getUTCHours() === parts.hour &&
    parsed.getUTCMinutes() === parts.minute &&
    parsed.getUTCSeconds() === parts.second &&
    parsed.getUTCMilliseconds() === parts.millisecond
  );
}

function createUtcTimestamp(parts: IsoDateTimeParts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}

function dashboardTimeRangeToDraft(value: unknown): DashboardTimeRangeDraft {
  if (!isRecord(value)) {
    return createDefaultDashboardTimeRangeDraft();
  }

  const mode = typeof value.mode === 'string' ? value.mode.trim() : '';
  if (mode === 'relative') {
    return createDefaultDashboardTimeRangeDraft({
      mode: 'relative',
      relative: typeof value.relative === 'string' ? value.relative.trim() : ''
    });
  }

  if (mode === 'absolute') {
    return createDefaultDashboardTimeRangeDraft({
      mode: 'absolute',
      from: typeof value.from === 'string' ? value.from.trim() : '',
      to: typeof value.to === 'string' ? value.to.trim() : ''
    });
  }

  return createDefaultDashboardTimeRangeDraft();
}

function formatRelativeTimeRangeLabel(value: DashboardRelativeTimeRange) {
  return `最近 ${value}`;
}

function formatRelativeTimeRangeText(value: DashboardRelativeTimeRange) {
  switch (value) {
    case '15m':
      return '15 分钟';
    case '1h':
      return '1 小时';
    case '6h':
      return '6 小时';
    case '24h':
      return '24 小时';
    case '7d':
      return '7 天';
  }
}

function hasIsoTimezone(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function formatDashboardTimeRangeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
