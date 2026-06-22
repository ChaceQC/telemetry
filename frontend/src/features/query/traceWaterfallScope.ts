import type { EventQueryParams, LogQueryParams, MetricQueryParams, TraceQueryParams } from '../../api/query';

export function buildTraceWaterfallScopeKey(
  sessionRevision: number,
  pageNumber: number,
  paginationVersion: number,
  params: MetricQueryParams | LogQueryParams | TraceQueryParams | EventQueryParams
) {
  return JSON.stringify({
    sessionRevision,
    pageNumber,
    paginationVersion,
    params
  });
}
