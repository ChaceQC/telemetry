import { describe, expect, it } from 'vitest';
import type { TraceQueryItem } from '../../api/query';
import { buildTraceWaterfallGroups } from './traceWaterfall';

const baseSpan: TraceQueryItem = {
  id: 1,
  project_id: 21,
  trace_id: 'trace-a',
  span_id: 'root',
  parent_span_id: null,
  name: 'GET /checkout',
  start_time: '2026-06-22T03:10:00.000Z',
  end_time: '2026-06-22T03:10:00.100Z',
  duration_ms: 100,
  status_code: 'ok',
  source: 'api',
  attributes: {},
  payload: {},
  occurred_at: '2026-06-22T03:10:00.000Z',
  received_at: '2026-06-22T03:10:01.000Z'
};

function span(overrides: Partial<TraceQueryItem>): TraceQueryItem {
  return {
    ...baseSpan,
    ...overrides
  };
}

describe('trace waterfall model', () => {
  it('按 trace_id 分组并按父子关系输出树形顺序', () => {
    const groups = buildTraceWaterfallGroups([
      span({
        id: 2,
        span_id: 'child-db',
        parent_span_id: 'root',
        name: 'SELECT orders',
        start_time: '2026-06-22T03:10:00.030Z',
        end_time: '2026-06-22T03:10:00.090Z',
        duration_ms: 60
      }),
      span({ id: 1 }),
      span({
        id: 3,
        span_id: 'child-cache',
        parent_span_id: 'root',
        name: 'cache get',
        start_time: '2026-06-22T03:10:00.010Z',
        end_time: '2026-06-22T03:10:00.015Z',
        duration_ms: 5
      }),
      span({
        id: 4,
        trace_id: 'trace-b',
        span_id: 'trace-b-root',
        parent_span_id: null,
        name: 'background job'
      })
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].traceId).toBe('trace-a');
    expect(groups[0].spanCount).toBe(3);
    expect(groups[0].rootCount).toBe(1);
    expect(groups[0].spans.map((item) => `${item.depth}:${item.item.span_id}`)).toEqual([
      '0:root',
      '1:child-cache',
      '1:child-db'
    ]);
    expect(groups[1].traceId).toBe('trace-b');
  });

  it('缺失 parent 的孤儿 span 稳定作为根节点展示', () => {
    const [group] = buildTraceWaterfallGroups([
      span({ id: 1, span_id: 'root' }),
      span({
        id: 5,
        span_id: 'orphan',
        parent_span_id: 'missing-parent',
        name: 'lost child',
        start_time: '2026-06-22T03:10:00.020Z',
        end_time: '2026-06-22T03:10:00.040Z',
        duration_ms: 20
      })
    ]);

    expect(group.rootCount).toBe(2);
    expect(group.orphanCount).toBe(1);
    expect(group.spans.find((item) => item.item.span_id === 'orphan')).toMatchObject({
      depth: 0,
      isOrphan: true
    });
  });

  it('异常 parent 关系不会让 self parent、环或重复 span_id 丢失展示', () => {
    const [group] = buildTraceWaterfallGroups([
      span({ id: 1, span_id: 'self-parent', parent_span_id: 'self-parent', name: 'self parent' }),
      span({ id: 2, span_id: 'cycle-a', parent_span_id: 'cycle-b', name: 'cycle a' }),
      span({ id: 3, span_id: 'cycle-b', parent_span_id: 'cycle-a', name: 'cycle b' }),
      span({ id: 4, span_id: 'duplicate', parent_span_id: null, name: 'first duplicate' }),
      span({ id: 5, span_id: 'duplicate', parent_span_id: 'missing-duplicate-parent', name: 'second duplicate' })
    ]);

    expect(group.spanCount).toBe(5);
    expect(group.orphanCount).toBe(4);
    expect(group.rootCount).toBe(5);
    expect(group.spans.map((item) => `${item.depth}:${item.item.id}:${item.item.span_id}`)).toEqual([
      '0:1:self-parent',
      '0:2:cycle-a',
      '0:3:cycle-b',
      '0:4:duplicate',
      '0:5:duplicate'
    ]);
    expect(group.spans.find((item) => item.item.span_id === 'self-parent')).toMatchObject({
      depth: 0,
      isOrphan: true
    });
  });

  it('处理缺失 duration、0 duration、乱序、同起点和长 duration 的 waterfall 布局', () => {
    const [group] = buildTraceWaterfallGroups([
      span({
        id: 3,
        span_id: 'zero',
        name: 'same start zero',
        start_time: '2026-06-22T03:10:00.000Z',
        end_time: '2026-06-22T03:10:00.000Z',
        duration_ms: 0
      }),
      span({
        id: 1,
        span_id: 'long',
        name: 'long operation',
        start_time: '2026-06-22T03:10:00.000Z',
        end_time: '2026-06-22T03:10:02.500Z',
        duration_ms: 2500,
        status_code: 'ok'
      }),
      span({
        id: 2,
        span_id: 'missing-duration',
        name: 'derived duration',
        start_time: '2026-06-22T03:10:00.500Z',
        end_time: '2026-06-22T03:10:01.000Z',
        duration_ms: null
      }),
      span({
        id: 4,
        span_id: 'unknown-time',
        name: 'unknown time',
        start_time: null,
        end_time: null,
        duration_ms: null
      })
    ]);

    const bySpanId = new Map(group.spans.map((item) => [item.item.span_id, item]));

    expect(group.totalDurationMs).toBe(2500);
    expect(bySpanId.get('long')).toMatchObject({
      relativeStartMs: 0,
      widthPercent: 100,
      isSlow: true
    });
    expect(bySpanId.get('zero')).toMatchObject({
      relativeStartMs: 0,
      durationMs: 0,
      widthPercent: 2
    });
    expect(bySpanId.get('missing-duration')).toMatchObject({
      relativeStartMs: 500,
      durationMs: 500,
      hasPartialTiming: true
    });
    expect(bySpanId.get('unknown-time')).toMatchObject({
      relativeStartMs: null,
      durationMs: null,
      offsetPercent: 0,
      widthPercent: 2
    });
  });

  it('标记错误 span 和本地慢 span 阈值', () => {
    const [group] = buildTraceWaterfallGroups(
      [
        span({
          id: 1,
          span_id: 'error',
          status_code: 'ERROR',
          duration_ms: 20
        }),
        span({
          id: 2,
          span_id: 'slow',
          status_code: 'ok',
          start_time: '2026-06-22T03:10:00.000Z',
          end_time: '2026-06-22T03:10:00.800Z',
          duration_ms: 800
        })
      ],
      { slowThresholdMs: 500 }
    );

    expect(group.errorCount).toBe(1);
    expect(group.slowCount).toBe(1);
    expect(group.spans.find((item) => item.item.span_id === 'error')?.isError).toBe(true);
    expect(group.spans.find((item) => item.item.span_id === 'slow')?.isSlow).toBe(true);
  });
});
