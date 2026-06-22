import { describe, expect, it } from 'vitest';
import type { MetricQueryItem } from '../../api/query';
import { buildMetricTrendModel } from './metricTrend';

function metric(overrides: Partial<MetricQueryItem>): MetricQueryItem {
  return {
    id: 1,
    project_id: 10,
    name: 'http.requests',
    value: 1,
    unit: 'ms',
    type: 'gauge',
    source: 'api',
    tags: {},
    payload: {},
    occurred_at: null,
    received_at: '2026-06-22T10:00:00.000Z',
    ...overrides
  };
}

describe('metric trend model', () => {
  it('按 received_at 升序生成当前页趋势点和路径', () => {
    const model = buildMetricTrendModel([
      metric({ id: 3, value: 30, received_at: '2026-06-22T10:02:00.000Z' }),
      metric({ id: 1, value: 10, received_at: '2026-06-22T10:00:00.000Z' }),
      metric({ id: 2, value: 20, received_at: '2026-06-22T10:01:00.000Z' })
    ]);

    expect(model?.points.map((point) => point.id)).toEqual([1, 2, 3]);
    expect(model?.minValue).toBe(10);
    expect(model?.maxValue).toBe(30);
    expect(model?.firstPoint.value).toBe(10);
    expect(model?.lastPoint.value).toBe(30);
    expect(model?.linePath).toMatch(/^M 18 146 L 320 81 L 622 16$/);
    expect(model?.areaPath).toContain('Z');
  });

  it('相同 value 或相同 received_at 时保持稳定坐标', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, value: 7, received_at: '2026-06-22T10:00:00.000Z' }),
      metric({ id: 2, value: 7, received_at: '2026-06-22T10:00:00.000Z' })
    ]);

    expect(model?.points).toHaveLength(2);
    expect(model?.points.map((point) => point.x)).toEqual([320, 320]);
    expect(model?.points.map((point) => point.y)).toEqual([81, 81]);
  });

  it('忽略无效时间或无效数值记录', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, value: Number.NaN }),
      metric({ id: 2, received_at: 'not-a-date' })
    ]);

    expect(model).toBeNull();
  });
});
