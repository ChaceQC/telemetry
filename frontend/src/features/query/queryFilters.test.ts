import { describe, expect, it } from 'vitest';
import { buildMetricAggregateParams, buildQueryParams, defaultFilters } from './queryFilters';

describe('query filters', () => {
  it('logs 查询参数包含 keyword、trace/span、request/user 且保留分页 cursor', () => {
    expect(
      buildQueryParams(
        'logs',
        {
          ...defaultFilters,
          primary: 'error',
          keyword: 'timeout retry',
          traceId: ' trace-abc ',
          spanId: ' span-def ',
          requestId: ' req-789 ',
          userId: ' user-123 ',
          source: 'api'
        },
        'log-cursor-1'
      )
    ).toEqual({
      project_id: undefined,
      source: 'api',
      occurred_from: undefined,
      occurred_to: undefined,
      limit: 100,
      cursor: 'log-cursor-1',
      level: 'error',
      keyword: 'timeout retry',
      trace_id: 'trace-abc',
      span_id: 'span-def',
      request_id: 'req-789',
      user_id: 'user-123'
    });
  });

  it('metrics 和 events 查询参数不包含 logs 专属筛选', () => {
    const filters = {
      ...defaultFilters,
      primary: 'http.requests',
      keyword: 'ignored',
      traceId: 'ignored-trace',
      spanId: 'ignored-span',
      requestId: 'ignored-request',
      userId: 'ignored-user'
    };

    expect(buildQueryParams('metrics', filters)).toEqual({
      project_id: undefined,
      source: undefined,
      occurred_from: undefined,
      occurred_to: undefined,
      limit: 100,
      cursor: undefined,
      name: 'http.requests'
    });
    expect(buildQueryParams('events', { ...filters, primary: 'deploy.started' })).toEqual({
      project_id: undefined,
      source: undefined,
      occurred_from: undefined,
      occurred_to: undefined,
      limit: 100,
      cursor: undefined,
      type: 'deploy.started'
    });
  });

  it('traces 查询参数包含 trace/span/name 且不包含 logs 专属 request/user', () => {
    expect(
      buildQueryParams(
        'traces',
        {
          ...defaultFilters,
          primary: ' GET /api/orders ',
          traceId: ' trace-abc ',
          spanId: ' span-def ',
          requestId: 'ignored-request',
          userId: 'ignored-user',
          source: ' api ',
          limit: '50'
        },
        'trace-cursor-1'
      )
    ).toEqual({
      project_id: undefined,
      source: 'api',
      occurred_from: undefined,
      occurred_to: undefined,
      limit: 50,
      cursor: 'trace-cursor-1',
      trace_id: 'trace-abc',
      span_id: 'span-def',
      name: 'GET /api/orders'
    });
  });

  it('不传 cursor 时用于提交新筛选或刷新第一页', () => {
    expect(
      buildQueryParams('logs', {
        ...defaultFilters,
        keyword: 'database'
      })
    ).toMatchObject({
      cursor: undefined,
      keyword: 'database'
    });
  });

  it('metrics 聚合参数包含窗口和聚合方式但不包含 cursor', () => {
    expect(
      buildMetricAggregateParams({
        ...defaultFilters,
        projectId: '12',
        primary: ' http.requests ',
        source: ' api ',
        occurredFrom: '2026-06-20T10:00',
        occurredTo: '2026-06-20T11:00',
        limit: '20',
        metricWindow: '15m',
        metricAggregation: 'sum'
      })
    ).toEqual({
      project_id: 12,
      name: 'http.requests',
      source: 'api',
      occurred_from: '2026-06-20T10:00',
      occurred_to: '2026-06-20T11:00',
      limit: 20,
      window: '15m',
      aggregation: 'sum'
    });
  });
});
