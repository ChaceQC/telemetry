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

export function listEvents(params: EventQueryParams = {}) {
  return requestQueryPage<EventQueryItem>('/api/v1/query/events', params);
}

export function listLogs(params: LogQueryParams = {}) {
  return requestQueryPage<LogQueryItem>('/api/v1/query/logs', params);
}

export function listMetrics(params: MetricQueryParams = {}) {
  return requestQueryPage<MetricQueryItem>('/api/v1/query/metrics', params);
}

async function requestQueryPage<TItem>(path: string, params: QueryCommonParams): Promise<QueryResultPage<TItem>> {
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
