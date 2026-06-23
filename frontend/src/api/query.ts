import { apiRequest } from './http';
import { buildQueryPath } from './queryParams';

export type QueryCommonParams = {
  project_id?: number;
  source?: string;
  occurred_from?: string;
  occurred_to?: string;
  limit?: number;
  cursor?: string;
};

export type EventQueryParams = QueryCommonParams & {
  type?: string;
};

export type LogQueryParams = QueryCommonParams & {
  level?: string;
  keyword?: string;
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  user_id?: string;
};

export type TraceQueryParams = QueryCommonParams & {
  trace_id?: string;
  span_id?: string;
  name?: string;
};

export type TraceTopologyParams = Omit<QueryCommonParams, 'cursor' | 'project_id'> & {
  project_id: number;
};

export type LogContextParams = {
  before?: number;
  after?: number;
};

export type MetricQueryParams = QueryCommonParams & {
  name?: string;
};

export type MetricAggregation = 'avg' | 'sum' | 'min' | 'max' | 'count';

export type MetricAggregateParams = Omit<QueryCommonParams, 'cursor'> & {
  name?: string;
  window?: string;
  aggregation?: MetricAggregation;
};

export type EventQueryItem = {
  id: number;
  project_id: number;
  type: string;
  source: string | null;
  payload: Record<string, unknown>;
  occurred_at: string | null;
  received_at: string;
};

export type LogQueryItem = {
  id: number;
  project_id: number;
  level: string;
  message: string;
  source: string | null;
  logger: string | null;
  trace_id: string | null;
  span_id: string | null;
  attributes: Record<string, unknown>;
  payload: Record<string, unknown>;
  occurred_at: string | null;
  received_at: string;
};

export type MetricQueryItem = {
  id: number;
  project_id: number;
  name: string;
  value: number;
  unit: string | null;
  type: string | null;
  source: string | null;
  tags: Record<string, unknown>;
  payload: Record<string, unknown>;
  occurred_at: string | null;
  received_at: string;
};

export type TraceQueryItem = {
  id: number;
  project_id: number;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number | null;
  status_code: string | null;
  source: string | null;
  attributes: unknown;
  payload: unknown;
  occurred_at: string | null;
  received_at: string;
};

export type TraceTopologyNode = {
  source: string;
  span_count: number;
  trace_count: number;
  error_span_count: number;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
};

export type TraceTopologyEdge = {
  from_source: string;
  to_source: string;
  call_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
};

export type TraceTopologyResponse = {
  nodes: TraceTopologyNode[];
  edges: TraceTopologyEdge[];
};

export type QueryResultPage<TItem> = {
  items: TItem[];
  next_cursor: string | null;
};

export type MetricAggregateItem = {
  project_id: number;
  name: string;
  source: string | null;
  window_start: string;
  window_end: string;
  aggregation: MetricAggregation;
  value: number;
  sample_count: number;
  unit: string | null;
};

export type MetricAggregateResponse = {
  items: MetricAggregateItem[];
};

export type LogContextResponse = {
  target: LogQueryItem | null;
  before: LogQueryItem[];
  after: LogQueryItem[];
};

export const DEFAULT_LOG_CONTEXT_WINDOW = 5;
export const MAX_LOG_CONTEXT_WINDOW = 20;

export function listEvents(params: EventQueryParams = {}) {
  return requestQueryPage<EventQueryItem>('/api/v1/query/events', {
    project_id: params.project_id,
    type: params.type,
    source: params.source,
    occurred_from: params.occurred_from,
    occurred_to: params.occurred_to,
    limit: params.limit,
    cursor: params.cursor
  });
}

export function listLogs(params: LogQueryParams = {}) {
  return requestQueryPage<LogQueryItem>('/api/v1/query/logs', {
    project_id: params.project_id,
    level: params.level,
    keyword: params.keyword,
    trace_id: params.trace_id,
    span_id: params.span_id,
    request_id: params.request_id,
    user_id: params.user_id,
    source: params.source,
    occurred_from: params.occurred_from,
    occurred_to: params.occurred_to,
    limit: params.limit,
    cursor: params.cursor
  });
}

export function getLogContext(logId: number | string, params: LogContextParams = {}) {
  return apiRequest<LogContextResponse>(
    buildQueryPath(`/api/v1/query/logs/${encodeURIComponent(`${logId}`)}/context`, {
      before: normalizeLogContextWindow(params.before),
      after: normalizeLogContextWindow(params.after)
    })
  );
}

export function listTraces(params: TraceQueryParams = {}) {
  return requestQueryPage<TraceQueryItem>('/api/v1/query/traces', {
    project_id: params.project_id,
    trace_id: params.trace_id,
    span_id: params.span_id,
    name: params.name,
    source: params.source,
    occurred_from: params.occurred_from,
    occurred_to: params.occurred_to,
    limit: params.limit,
    cursor: params.cursor
  });
}

export function getTraceTopology(params: TraceTopologyParams) {
  return apiRequest<TraceTopologyResponse>(
    buildQueryPath('/api/v1/query/traces/topology', {
      project_id: params.project_id,
      source: params.source,
      occurred_from: params.occurred_from,
      occurred_to: params.occurred_to,
      limit: params.limit
    })
  );
}

export function listMetrics(params: MetricQueryParams = {}) {
  return requestQueryPage<MetricQueryItem>('/api/v1/query/metrics', {
    project_id: params.project_id,
    name: params.name,
    source: params.source,
    occurred_from: params.occurred_from,
    occurred_to: params.occurred_to,
    limit: params.limit,
    cursor: params.cursor
  });
}

export async function listMetricAggregates(params: MetricAggregateParams = {}): Promise<MetricAggregateResponse> {
  const response = await apiRequest<MetricAggregateResponse | MetricAggregateItem[]>(
    buildQueryPath('/api/v1/query/metrics/aggregate', {
      project_id: params.project_id,
      name: params.name,
      source: params.source,
      occurred_from: params.occurred_from,
      occurred_to: params.occurred_to,
      window: params.window,
      aggregation: params.aggregation,
      limit: params.limit
    })
  );

  return {
    items: Array.isArray(response) ? response : response.items
  };
}

async function requestQueryPage<TItem>(
  path: string,
  params: Record<string, string | number | undefined | null>
): Promise<QueryResultPage<TItem>> {
  const response = await apiRequest<QueryResultPage<TItem> | TItem[]>(buildQueryPath(path, params));

  if (Array.isArray(response)) {
    return {
      items: response,
      next_cursor: null
    };
  }

  return {
    items: response.items,
    next_cursor: response.next_cursor ?? null
  };
}

export function normalizeLogContextWindow(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_LOG_CONTEXT_WINDOW;
  }

  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) {
    return DEFAULT_LOG_CONTEXT_WINDOW;
  }

  return Math.min(MAX_LOG_CONTEXT_WINDOW, Math.max(0, numeric));
}
