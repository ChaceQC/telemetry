import { describe, expect, it } from 'vitest';
import {
  applyLogsTraceSearchToFilters,
  buildLogsTraceSearch,
  buildTracesTraceSearch,
  parseLogsTraceSearch
} from './logTraceLinks';
import { defaultFilters } from './queryFilters';

describe('log trace links', () => {
  it('构建 logs 查询串时会 trim trace/span 并保留 URL 编码', () => {
    expect(buildLogsTraceSearch({ traceId: ' trace/a ', spanId: ' span b ' })).toBe(
      '?trace_id=trace%2Fa&span_id=span+b'
    );
  });

  it('构建 traces 查询串时复用 trace/span 编码并要求 trace_id', () => {
    expect(buildTracesTraceSearch({ traceId: ' trace/a ', spanId: ' span b ' })).toBe(
      '?trace_id=trace%2Fa&span_id=span+b'
    );
    expect(buildTracesTraceSearch({ traceId: ' trace/a ' })).toBe('?trace_id=trace%2Fa');
    expect(buildTracesTraceSearch({ traceId: ' ', spanId: 'span-only' })).toBe('');
  });

  it('解析 logs 查询串时只读取非空 trace_id 和 span_id', () => {
    expect(parseLogsTraceSearch('?trace_id=trace-a&span_id=span-b&keyword=ignored')).toEqual({
      traceId: 'trace-a',
      spanId: 'span-b',
      hasAppliedFilters: true
    });
    expect(parseLogsTraceSearch('?trace_id=+&span_id=')).toEqual({
      traceId: undefined,
      spanId: undefined,
      hasAppliedFilters: false
    });
  });

  it('应用 URL 参数时只覆盖 logs 关联筛选并保留手动筛选字段', () => {
    expect(
      applyLogsTraceSearchToFilters('?trace_id=trace-url&span_id=span-url', {
        ...defaultFilters,
        primary: 'error',
        keyword: 'timeout',
        requestId: 'req-1',
        userId: 'user-1'
      })
    ).toMatchObject({
      primary: 'error',
      keyword: 'timeout',
      traceId: 'trace-url',
      spanId: 'span-url',
      requestId: 'req-1',
      userId: 'user-1'
    });
  });
});
