import { describe, expect, it } from 'vitest';
import { buildQueryParams, defaultFilters } from './queryFilters';

describe('query filters', () => {
  it('logs 查询参数包含 keyword 且保留分页 cursor', () => {
    expect(
      buildQueryParams(
        'logs',
        {
          ...defaultFilters,
          primary: 'error',
          keyword: 'timeout retry',
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
      keyword: 'timeout retry'
    });
  });

  it('metrics 和 events 查询参数不包含 logs keyword', () => {
    const filters = {
      ...defaultFilters,
      primary: 'http.requests',
      keyword: 'ignored'
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
});
