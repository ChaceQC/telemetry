import { defaultFilters, type QueryFilters } from './queryFilters';

export type LogsTraceSearch = {
  traceId?: string;
  spanId?: string;
  hasAppliedFilters: boolean;
};

type LogsTraceSearchInput = {
  traceId?: string | null;
  spanId?: string | null;
};

export function buildLogsTraceSearch(input: LogsTraceSearchInput): string {
  const params = new URLSearchParams();
  const traceId = normalizeSearchValue(input.traceId);
  const spanId = normalizeSearchValue(input.spanId);

  if (traceId) {
    params.set('trace_id', traceId);
  }

  if (spanId) {
    params.set('span_id', spanId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function parseLogsTraceSearch(search: string | URLSearchParams): LogsTraceSearch {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const traceId = normalizeSearchValue(params.get('trace_id'));
  const spanId = normalizeSearchValue(params.get('span_id'));

  return {
    traceId,
    spanId,
    hasAppliedFilters: Boolean(traceId || spanId)
  };
}

export function applyLogsTraceSearchToFilters(
  search: string | URLSearchParams,
  filters: QueryFilters = defaultFilters
): QueryFilters {
  const parsed = parseLogsTraceSearch(search);

  if (!parsed.hasAppliedFilters) {
    return filters;
  }

  return {
    ...filters,
    traceId: parsed.traceId ?? filters.traceId,
    spanId: parsed.spanId ?? filters.spanId
  };
}

function normalizeSearchValue(value: string | null | undefined) {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
