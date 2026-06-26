import { describe, expect, it } from 'vitest';
import type { AlertRule } from '../../api/alerts';
import {
  ALERT_JSON_MAX_BYTES,
  ALERT_JSON_MAX_DEPTH,
  buildCreateAlertRulePayload,
  buildToggleAlertRulePayload,
  buildUpdateAlertRulePayload,
  createDefaultAlertRuleForm
} from './alertRuleForm';

const rule: AlertRule = {
  id: 7,
  project_id: 12,
  name: 'HTTP 5xx rate',
  description: '5 分钟错误率过高',
  enabled: true,
  severity: 'critical',
  signal: 'metrics',
  condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
  evaluation: { window_seconds: 300, interval_seconds: 60 },
  created_by_user_id: 1,
  updated_by_user_id: 1,
  created_at: '2026-06-26T12:00:00Z',
  updated_at: '2026-06-26T12:00:00Z'
};

describe('alert rule form payload', () => {
  it('创建 payload 会 trim 名称并把空描述转成 null', () => {
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: ' HTTP 5xx rate ',
        description: ' ',
        severity: 'critical',
        signal: 'metrics',
        conditionText: '{"metric":"http.server.errors","operator":"gt","threshold":3}',
        evaluationText: '{"window_seconds":300,"interval_seconds":60}'
      })
    ).toEqual({
      ok: true,
      value: {
        project_id: 12,
        name: 'HTTP 5xx rate',
        description: null,
        enabled: true,
        severity: 'critical',
        signal: 'metrics',
        condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
        evaluation: { window_seconds: 300, interval_seconds: 60 }
      }
    });
  });

  it('校验项目、名称、描述、枚举和 JSON 对象形状', () => {
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('0'), name: 'x' })).toEqual({
      ok: false,
      message: '项目 ID 必须是正整数。'
    });
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: '' })).toEqual({
      ok: false,
      message: '名称必须是 1 到 100 个字符。'
    });
    expect(
      buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', description: 'x'.repeat(501) })
    ).toEqual({
      ok: false,
      message: '描述不能超过 500 个字符。'
    });
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', signal: 'heartbeat' as never })).toEqual({
      ok: false,
      message: 'signal 必须是 metrics、logs、traces 或 events。'
    });
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', conditionText: '[]' })).toEqual({
      ok: false,
      message: 'condition 必须是非空 JSON 对象。'
    });
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', conditionText: '{}' })).toEqual({
      ok: false,
      message: 'condition 必须是非空 JSON 对象。'
    });
  });

  it('拒绝明显非法 JSON、非有限数、超大和过深 JSON', () => {
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', conditionText: '{"value":NaN}' })).toEqual({
      ok: false,
      message: 'condition 不能包含 NaN 或 Infinity。'
    });
    expect(
      buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', conditionText: '{"value":Infinity}' })
    ).toEqual({
      ok: false,
      message: 'condition 不能包含 NaN 或 Infinity。'
    });
    expect(buildCreateAlertRulePayload({ ...createDefaultAlertRuleForm('12'), name: 'x', conditionText: '{bad}' })).toEqual({
      ok: false,
      message: 'condition 不是有效 JSON。'
    });
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: 'x',
        conditionText: JSON.stringify({ blob: 'x'.repeat(ALERT_JSON_MAX_BYTES) })
      })
    ).toEqual({
      ok: false,
      message: `condition 不能超过 ${ALERT_JSON_MAX_BYTES} 字节。`
    });
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: 'x',
        conditionText: `{"a":${'['.repeat(ALERT_JSON_MAX_DEPTH)}0${']'.repeat(ALERT_JSON_MAX_DEPTH)}}`
      })
    ).toEqual({
      ok: false,
      message: `condition 嵌套深度不能超过 ${ALERT_JSON_MAX_DEPTH}。`
    });
  });

  it('evaluation 必须包含 1..86400 整数 window_seconds 和 interval_seconds', () => {
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: 'x',
        evaluationText: '{"interval_seconds":60}'
      })
    ).toEqual({
      ok: false,
      message: 'evaluation.window_seconds 必须是 1..86400 的整数。'
    });
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: 'x',
        evaluationText: '{"window_seconds":300,"interval_seconds":0}'
      })
    ).toEqual({
      ok: false,
      message: 'evaluation.interval_seconds 必须是 1..86400 的整数。'
    });
    expect(
      buildCreateAlertRulePayload({
        ...createDefaultAlertRuleForm('12'),
        name: 'x',
        evaluationText: '{"window_seconds":300.5,"interval_seconds":60}'
      })
    ).toEqual({
      ok: false,
      message: 'evaluation.window_seconds 必须是 1..86400 的整数。'
    });
  });

  it('编辑 payload 只提交变化字段并允许 description=null', () => {
    expect(
      buildUpdateAlertRulePayload(rule, {
        projectId: '12',
        name: 'HTTP 5xx burn rate',
        description: '',
        enabled: false,
        severity: 'warning',
        signal: 'logs',
        conditionText: '{"field":"level","operator":"eq","value":"error"}',
        evaluationText: '{"window_seconds":600,"interval_seconds":120}'
      })
    ).toEqual({
      ok: true,
      value: {
        name: 'HTTP 5xx burn rate',
        description: null,
        enabled: false,
        severity: 'warning',
        signal: 'logs',
        condition: { field: 'level', operator: 'eq', value: 'error' },
        evaluation: { window_seconds: 600, interval_seconds: 120 }
      }
    });
  });

  it('编辑无变化时提示且启停 payload 只包含 enabled', () => {
    expect(
      buildUpdateAlertRulePayload(rule, {
        projectId: '12',
        name: rule.name,
        description: rule.description ?? '',
        enabled: rule.enabled,
        severity: rule.severity,
        signal: rule.signal,
        conditionText: JSON.stringify(rule.condition, null, 2),
        evaluationText: JSON.stringify(rule.evaluation, null, 2)
      })
    ).toEqual({
      ok: false,
      message: '至少修改一个字段后再保存。'
    });

    expect(buildToggleAlertRulePayload(false)).toEqual({ enabled: false });
  });
});
