import type { EventQueryParams, LogQueryParams, MetricQueryParams } from '../../api/query';

export type QuerySignal = 'metrics' | 'logs' | 'events';

export type QueryFilters = {
  projectId: string;
  primary: string;
  keyword: string;
  source: string;
  occurredFrom: string;
  occurredTo: string;
  limit: string;
};

export const defaultFilters: QueryFilters = {
  projectId: '',
  primary: '',
  keyword: '',
  source: '',
  occurredFrom: '',
  occurredTo: '',
  limit: '100'
};

export type BuiltQueryParams = MetricQueryParams | LogQueryParams | EventQueryParams;

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
      keyword: toOptional(filters.keyword)
    };
  }

  return { ...common, type: toOptional(filters.primary) };
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
