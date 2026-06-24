import { describe, expect, it } from 'vitest';
import {
  createDefaultDashboardTimeRangeDraft,
  normalizeDashboardConfigTimeRange,
  readDashboardTimeRangeFromConfigText,
  writeDashboardTimeRangeToConfigText
} from './dashboardTimeRange';

describe('dashboard time range config helpers', () => {
  it('读取 legacy config 时返回未配置状态并允许写入默认草稿', () => {
    expect(readDashboardTimeRangeFromConfigText('{"refresh_seconds":30}')).toEqual({
      ok: true,
      editable: true,
      state: 'missing',
      statusLabel: '未配置',
      message: '当前 config 未包含全局时间范围。',
      draft: createDefaultDashboardTimeRangeDraft()
    });
  });

  it('写入 relative time_range 时保留其他 config 字段', () => {
    const result = writeDashboardTimeRangeToConfigText('{"refresh_seconds":30,"panels":[]}', {
      mode: 'relative',
      relative: '7d',
      from: '',
      to: ''
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        panels: [],
        time_range: {
          mode: 'relative',
          relative: '7d'
        }
      }
    });
  });

  it('写入 none 时删除已有 time_range 并保留其他字段', () => {
    const result = writeDashboardTimeRangeToConfigText(
      '{"refresh_seconds":30,"time_range":{"mode":"relative","relative":"1h"}}',
      createDefaultDashboardTimeRangeDraft({ mode: 'none' })
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30
      }
    });
    expect(result.ok ? 'time_range' in result.value : true).toBe(false);
  });

  it('标准化 relative 和 absolute time_range 的空白', () => {
    expect(
      normalizeDashboardConfigTimeRange({
        refresh_seconds: 30,
        time_range: { mode: ' relative ', relative: ' 15m ' }
      })
    ).toEqual({
      ok: true,
      value: {
        refresh_seconds: 30,
        time_range: { mode: 'relative', relative: '15m' }
      }
    });

    expect(
      normalizeDashboardConfigTimeRange({
        time_range: {
          mode: '\tabsolute\n',
          from: ' 2026-06-24T00:00:00Z ',
          to: '\t2026-06-24T01:00:00+00:00\n'
        }
      })
    ).toEqual({
      ok: true,
      value: {
        time_range: {
          mode: 'absolute',
          from: '2026-06-24T00:00:00Z',
          to: '2026-06-24T01:00:00+00:00'
        }
      }
    });
  });

  it('校验 time_range mode、relative 和 absolute 边界', () => {
    expect(normalizeDashboardConfigTimeRange({ time_range: '24h' })).toEqual({
      ok: false,
      message: 'config.time_range 必须是 JSON 对象。'
    });
    expect(normalizeDashboardConfigTimeRange({ time_range: { mode: 'last', relative: '15m' } })).toEqual({
      ok: false,
      message: 'config.time_range.mode 必须是 relative/absolute 之一。'
    });
    expect(normalizeDashboardConfigTimeRange({ time_range: { mode: 'relative', relative: '10m' } })).toEqual({
      ok: false,
      message: 'config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一。'
    });
    expect(
      normalizeDashboardConfigTimeRange({
        time_range: { mode: 'absolute', from: 'not-a-time', to: '2026-06-24T01:00:00Z' }
      })
    ).toEqual({
      ok: false,
      message: 'config.time_range.from 必须是 ISO 8601 时间字符串。'
    });
    expect(
      normalizeDashboardConfigTimeRange({
        time_range: { mode: 'absolute', from: '2026-06-24T01:00:00Z', to: '2026-06-24T01:00:00Z' }
      })
    ).toEqual({
      ok: false,
      message: 'config.time_range.from 必须早于 config.time_range.to。'
    });
    expect(
      normalizeDashboardConfigTimeRange({
        time_range: { mode: 'absolute', from: '2026-06-24T00:00:00Z', to: '2026-06-24T01:00:00' }
      })
    ).toEqual({
      ok: false,
      message: 'config.time_range.from/to 必须使用可比较的 ISO 8601 时间字符串。'
    });
  });

  it('读取非法 time_range 时保留可修复草稿', () => {
    expect(readDashboardTimeRangeFromConfigText('{"time_range":{"mode":"relative","relative":"10m"}}')).toEqual({
      ok: false,
      editable: true,
      state: 'invalid-time-range',
      statusLabel: '配置错误',
      message: 'config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一。',
      draft: {
        mode: 'relative',
        relative: '10m',
        from: '',
        to: ''
      }
    });

    expect(readDashboardTimeRangeFromConfigText('[]')).toEqual({
      ok: false,
      editable: false,
      state: 'not-object',
      statusLabel: '不可编辑',
      message: 'config 必须是 JSON 对象才能使用 time_range。',
      draft: createDefaultDashboardTimeRangeDraft()
    });
  });
});
