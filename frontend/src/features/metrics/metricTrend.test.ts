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

    expect(model.status).toBe('ready');

    if (model.status !== 'ready') {
      return;
    }

    expect(model.seriesName).toBe('http.requests');
    expect(model.seriesUnit).toBe('ms');
    expect(model.points.map((point) => point.id)).toEqual([1, 2, 3]);
    expect(model.minValue).toBe(10);
    expect(model.maxValue).toBe(30);
    expect(model.firstPoint.value).toBe(10);
    expect(model.lastPoint.value).toBe(30);
    expect(model.linePath).toMatch(/^M 18 146 L 320 81 L 622 16$/);
    expect(model.areaPath).toContain('Z');
  });

  it('相同 value 或相同 received_at 时保持稳定坐标', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, value: 7, received_at: '2026-06-22T10:00:00.000Z' }),
      metric({ id: 2, value: 7, received_at: '2026-06-22T10:00:00.000Z' })
    ]);

    expect(model.status).toBe('ready');

    if (model.status !== 'ready') {
      return;
    }

    expect(model.points).toHaveLength(2);
    expect(model.points.map((point) => point.x)).toEqual([320, 320]);
    expect(model.points.map((point) => point.y)).toEqual([81, 81]);
  });

  it('忽略无效时间或无效数值记录', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, value: Number.NaN }),
      metric({ id: 2, received_at: 'not-a-date' })
    ]);

    expect(model).toEqual({
      status: 'unavailable',
      reason: 'no-plottable-points'
    });
  });

  it('当前页同 name 和 unit 时可以绘制趋势', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, name: 'cpu.usage', value: 0.5, unit: 'percent' }),
      metric({ id: 2, name: 'cpu.usage', value: 0.7, unit: 'percent' })
    ]);

    expect(model.status).toBe('ready');

    if (model.status !== 'ready') {
      return;
    }

    expect(model.seriesName).toBe('cpu.usage');
    expect(model.seriesUnit).toBe('percent');
    expect(model.linePath).not.toBe('');
  });

  it('当前页包含不同 name 时不绘制趋势', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, name: 'cpu.usage', value: 0.5, unit: 'percent' }),
      metric({ id: 2, name: 'memory.usage', value: 0.7, unit: 'percent' })
    ]);

    expect(model).toEqual({
      status: 'unavailable',
      reason: 'mixed-series'
    });
  });

  it('当前页包含不同 unit 时不绘制趋势', () => {
    const model = buildMetricTrendModel([
      metric({ id: 1, name: 'http.latency', value: 50, unit: 'ms' }),
      metric({ id: 2, name: 'http.latency', value: 0.05, unit: 's' })
    ]);

    expect(model).toEqual({
      status: 'unavailable',
      reason: 'mixed-series'
    });
  });
});
