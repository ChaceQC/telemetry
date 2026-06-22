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
};

export type LogContextParams = {
  before?: number;
  after?: number;
};

export type MetricQueryParams = QueryCommonParams & {
  name?: string;
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

export type QueryResultPage<TItem> = {
  items: TItem[];
  next_cursor: string | null;
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
