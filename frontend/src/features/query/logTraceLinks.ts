import { defaultFilters, type QueryFilters } from './queryFilters';

export type LogsTraceSearch = {
  traceId?: string;
  spanId?: string;
  hasAppliedFilters: boolean;
};

export type TraceSearchFilters = LogsTraceSearch;

type TraceSearchInput = {
  traceId?: string | null;
  spanId?: string | null;
};

export function buildLogsTraceSearch(input: TraceSearchInput): string {
  return buildTraceSearch(input);
}

export function buildTracesTraceSearch(input: TraceSearchInput): string {
  return buildTraceSearch(input, { requireTraceId: true });
}

function buildTraceSearch(input: TraceSearchInput, options: { requireTraceId?: boolean } = {}): string {
  const params = new URLSearchParams();
  const traceId = normalizeSearchValue(input.traceId);
  const spanId = normalizeSearchValue(input.spanId);

  if (options.requireTraceId && !traceId) {
    return '';
  }

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
  return parseTraceSearch(search);
}

export function parseTraceSearch(search: string | URLSearchParams): TraceSearchFilters {
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
  return applyTraceSearchToFilters(search, filters);
}

export function applyTraceSearchToFilters(
  search: string | URLSearchParams,
  filters: QueryFilters = defaultFilters
): QueryFilters {
  const parsed = parseTraceSearch(search);

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
