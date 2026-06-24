import { describe, expect, it } from 'vitest';
import {
  createDefaultDashboardVariableDraft,
  dashboardVariableToDraft,
  normalizeDashboardConfigVariables,
  readDashboardVariablesFromConfigText,
  removeDashboardVariableFromConfigText,
  upsertDashboardVariableInConfigText
} from './dashboardVariables';

describe('dashboard variable config helpers', () => {
  it('读取 legacy config 时兼容缺失 variables 并允许新增', () => {
    const result = readDashboardVariablesFromConfigText('{"refresh_seconds":30,"legacy":{"a":1}}');

    expect(result).toEqual({
      ok: true,
      config: { refresh_seconds: 30, legacy: { a: 1 } },
      variables: [],
      hasVariables: false
    });
  });

  it('添加 select variable 时裁剪 options、去重并保留其他 config 字段', () => {
    const result = upsertDashboardVariableInConfigText('{"refresh_seconds":30,"panels":[]}', {
      ...createDefaultDashboardVariableDraft(),
      name: ' env ',
      label: ' Environment ',
      type: 'select',
      defaultValue: ' prod ',
      optionsText: ' prod, staging\nprod '
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        panels: [],
        variables: [
          {
            name: 'env',
            label: 'Environment',
            type: 'select',
            default: 'prod',
            options: ['prod', 'staging']
          }
        ]
      }
    });
  });

  it('添加 text 和 number variable 时分别规范化 default 并拒绝 text options', () => {
    expect(
      upsertDashboardVariableInConfigText('{}', {
        ...createDefaultDashboardVariableDraft(),
        name: 'service_name',
        label: '',
        type: 'text',
        defaultValue: ' checkout ',
        optionsText: ''
      })
    ).toMatchObject({
      ok: true,
      value: {
        variables: [{ name: 'service_name', type: 'text', default: 'checkout' }]
      }
    });

    expect(
      upsertDashboardVariableInConfigText('{}', {
        ...createDefaultDashboardVariableDraft(),
        name: 'sample_rate',
        type: 'number',
        defaultValue: '0.5'
      })
    ).toMatchObject({
      ok: true,
      value: {
        variables: [{ name: 'sample_rate', type: 'number', default: 0.5 }]
      }
    });

    expect(
      upsertDashboardVariableInConfigText('{}', {
        ...createDefaultDashboardVariableDraft(),
        name: 'env',
        type: 'text',
        defaultValue: 'prod',
        optionsText: 'prod'
      })
    ).toEqual({
      ok: false,
      message: 'variable.options 仅支持 select 类型变量。'
    });
  });

  it('编辑和删除 variable 时更新 variables 数组', () => {
    const configText = JSON.stringify({
      refresh_seconds: 30,
      variables: [
        { name: 'env', label: '环境', type: 'select', options: ['prod', 'staging'], default: 'prod' },
        { name: 'sample_rate', type: 'number', default: 1 }
      ]
    });
    const readResult = readDashboardVariablesFromConfigText(configText);
    expect(readResult.ok).toBe(true);
    const draft = readResult.ok ? dashboardVariableToDraft(readResult.variables[1], 1) : createDefaultDashboardVariableDraft();

    const edited = upsertDashboardVariableInConfigText(configText, {
      ...draft,
      label: 'Sample rate',
      defaultValue: '0.25'
    });

    expect(edited).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        variables: [
          { name: 'env' },
          { name: 'sample_rate', label: 'Sample rate', type: 'number', default: 0.25 }
        ]
      }
    });

    const removed = edited.ok ? removeDashboardVariableFromConfigText(edited.configText, 0) : edited;
    expect(removed).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        variables: [{ name: 'sample_rate', label: 'Sample rate', type: 'number', default: 0.25 }]
      }
    });
  });

  it('编辑 variable 时拒绝旧 index 已不再指向原 name 的草稿', () => {
    const draft = {
      mode: 'edit' as const,
      editIndex: 1,
      originalVariableName: 'sample_rate',
      name: 'sample_rate',
      label: '',
      type: 'number' as const,
      defaultValue: '1',
      optionsText: ''
    };
    const reordered = JSON.stringify({
      variables: [
        { name: 'sample_rate', type: 'number', default: 1 },
        { name: 'env', type: 'select', options: ['prod'] }
      ]
    });
    const deleted = JSON.stringify({
      variables: [{ name: 'env', type: 'select', options: ['prod'] }]
    });

    expect(upsertDashboardVariableInConfigText(reordered, draft)).toEqual({
      ok: false,
      message: '当前 config.variables 已变化，请重新选择要更新的变量。'
    });
    expect(upsertDashboardVariableInConfigText(deleted, draft)).toEqual({
      ok: false,
      message: '当前 config.variables 已变化，请重新选择要更新的变量。'
    });
  });

  it('校验 name、type、default、options 和重复 name 边界', () => {
    expect(
      normalizeDashboardConfigVariables({
        variables: [
          { name: 'env', type: 'text' },
          { name: ' env ', type: 'select', options: ['prod'] }
        ]
      })
    ).toEqual({
      ok: false,
      message: 'config.variables[1].name 不能重复。'
    });

    expect(normalizeDashboardConfigVariables({ variables: [{ name: '1env', type: 'text' }] })).toEqual({
      ok: false,
      message: 'config.variables[0].name 只能包含字母、数字和下划线，且不能以数字开头。'
    });
    expect(normalizeDashboardConfigVariables({ variables: [{ name: 'env', type: 'unknown' }] })).toEqual({
      ok: false,
      message: 'config.variables[0].type 必须是 text/number/select 之一。'
    });
    expect(normalizeDashboardConfigVariables({ variables: [{ name: 'sample_rate', type: 'number', default: '1' }] })).toEqual({
      ok: false,
      message: 'config.variables[0].default 必须是有限数字。'
    });
    expect(normalizeDashboardConfigVariables({ variables: [{ name: 'env', type: 'text', options: ['prod'] }] })).toEqual({
      ok: false,
      message: 'config.variables[0].options 仅支持 select 类型变量。'
    });
    expect(normalizeDashboardConfigVariables({ variables: [{ name: 'env', type: 'select', options: [] }] })).toEqual({
      ok: false,
      message: 'config.variables[0].options 不能为空。'
    });
    expect(normalizeDashboardConfigVariables({ variables: [{ name: 'env', type: 'select', options: ['prod', ' prod '] }] })).toEqual({
      ok: false,
      message: 'config.variables[0].options[1] 不能重复。'
    });
    expect(
      normalizeDashboardConfigVariables({
        variables: [{ name: 'env', type: 'select', options: ['prod'], default: 'staging' }]
      })
    ).toEqual({
      ok: false,
      message: 'config.variables[0].default 必须匹配 options 中的一个值。'
    });
  });
});
