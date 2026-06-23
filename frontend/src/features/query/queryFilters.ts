import type {
  EventQueryParams,
  LogQueryParams,
  MetricAggregateParams,
  MetricAggregation,
  MetricQueryParams,
  TraceTopologyParams,
  TraceQueryParams
} from '../../api/query';

export type QuerySignal = 'metrics' | 'logs' | 'traces' | 'events';

export const metricWindowOptions = ['1m', '5m', '15m', '1h'] as const;
export const metricAggregationOptions = ['avg', 'sum', 'min', 'max', 'count'] as const;

export type MetricWindow = (typeof metricWindowOptions)[number];

export type QueryFilters = {
  projectId: string;
  primary: string;
  keyword: string;
  traceId: string;
  spanId: string;
  requestId: string;
  userId: string;
  source: string;
  occurredFrom: string;
  occurredTo: string;
  limit: string;
  metricWindow: MetricWindow;
  metricAggregation: MetricAggregation;
};

export const defaultFilters: QueryFilters = {
  projectId: '',
  primary: '',
  keyword: '',
  traceId: '',
  spanId: '',
  requestId: '',
  userId: '',
  source: '',
  occurredFrom: '',
  occurredTo: '',
  limit: '100',
  metricWindow: '5m',
  metricAggregation: 'avg'
};

export type BuiltQueryParams = MetricQueryParams | LogQueryParams | TraceQueryParams | EventQueryParams;

export function buildQueryParams(signal: QuerySignal, filters: QueryFilters, cursor?: string): BuiltQueryParams {
  const common = {
    project_id: toNumber(filters.projectId),
    source: toOptional(filters.source),
    occurred_from: toOptional(filters.occurredFrom),
    occurred_to: toOptional(filters.occurredTo),
    limit: toNumber(filters.limit),
    cursor
  };

  if (signal === 'metrics') {
    return { ...common, name: toOptional(filters.primary) };
  }

  if (signal === 'logs') {
    return {
      ...common,
      level: toOptional(filters.primary),
      keyword: toOptional(filters.keyword),
      trace_id: toOptional(filters.traceId),
      span_id: toOptional(filters.spanId),
      request_id: toOptional(filters.requestId),
      user_id: toOptional(filters.userId)
    };
  }

  if (signal === 'traces') {
    return {
      ...common,
      trace_id: toOptional(filters.traceId),
      span_id: toOptional(filters.spanId),
      name: toOptional(filters.primary)
    };
  }

  return { ...common, type: toOptional(filters.primary) };
}

export function buildMetricAggregateParams(filters: QueryFilters): MetricAggregateParams {
  return {
    project_id: toNumber(filters.projectId),
    name: toOptional(filters.primary),
    source: toOptional(filters.source),
    occurred_from: toOptional(filters.occurredFrom),
    occurred_to: toOptional(filters.occurredTo),
    limit: toNumber(filters.limit),
    window: normalizeMetricWindow(filters.metricWindow),
    aggregation: normalizeMetricAggregation(filters.metricAggregation)
  };
}

export function buildTraceTopologyParams(filters: QueryFilters): TraceTopologyParams | null {
  const projectId = toNumber(filters.projectId);

  if (projectId === undefined || !Number.isInteger(projectId) || projectId < 1) {
    return null;
  }

  return {
    project_id: projectId,
    source: toOptional(filters.source),
    occurred_from: toOptional(filters.occurredFrom),
    occurred_to: toOptional(filters.occurredTo),
    limit: toNumber(filters.limit)
  };
}

function normalizeMetricWindow(value: string): MetricWindow {
  return metricWindowOptions.includes(value as MetricWindow) ? (value as MetricWindow) : defaultFilters.metricWindow;
}

function normalizeMetricAggregation(value: string): MetricAggregation {
  return metricAggregationOptions.includes(value as MetricAggregation)
    ? (value as MetricAggregation)
    : defaultFilters.metricAggregation;
}

function toOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}
