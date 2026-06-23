import { describe, expect, it } from 'vitest';
import {
  createDefaultDashboardPanelDraft,
  normalizeDashboardConfigPanels,
  readDashboardPanelsFromConfigText,
  removeDashboardPanelFromConfigText,
  upsertDashboardPanelInConfigText
} from './dashboardPanels';

describe('dashboard panel config helpers', () => {
  it('读取 legacy config 时兼容缺失 panels 并保留顶层字段', () => {
    const result = readDashboardPanelsFromConfigText('{"refresh_seconds":30,"legacy":{"a":1}}');

    expect(result).toEqual({
      ok: true,
      config: { refresh_seconds: 30, legacy: { a: 1 } },
      panels: [],
      hasPanels: false
    });
  });

  it('添加 panel 时生成后端兼容 config 并保留其他顶层 config 字段', () => {
    const result = upsertDashboardPanelInConfigText(
      '{"refresh_seconds":30}',
      {
        ...createDefaultDashboardPanelDraft(),
        id: ' cpu ',
        title: ' CPU 使用率 ',
        type: 'metrics',
        queryText: '{"name":"cpu.usage"}',
        layout: { x: '0', y: '1', w: '6', h: '3' }
      }
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        panels: [
          {
            id: 'cpu',
            title: 'CPU 使用率',
            type: 'metrics',
            query: { name: 'cpu.usage' },
            layout: { x: 0, y: 1, w: 6, h: 3 }
          }
        ]
      }
    });
  });

  it('按 trim 后 id 判断重复', () => {
    const result = normalizeDashboardConfigPanels({
      panels: [
        { id: 'cpu', title: 'CPU', type: 'metrics', query: {} },
        { id: ' cpu ', title: 'CPU 复制', type: 'logs', query: {} }
      ]
    });

    expect(result).toEqual({
      ok: false,
      message: 'config.panels[1].id 不能重复。'
    });
  });

  it('拒绝非 object query', () => {
    const result = normalizeDashboardConfigPanels({
      panels: [{ id: 'logs', title: '日志', type: 'logs', query: [] }]
    });

    expect(result).toEqual({
      ok: false,
      message: 'config.panels[0].query 必须是 JSON 对象。'
    });
  });

  it('校验 layout 数字边界', () => {
    expect(
      normalizeDashboardConfigPanels({
        panels: [{ id: 'events', title: '事件', type: 'events', query: {}, layout: { x: -1, y: 0, w: 1, h: 1 } }]
      })
    ).toEqual({
      ok: false,
      message: 'config.panels[0].layout.x 不能小于 0。'
    });

    expect(
      upsertDashboardPanelInConfigText(
        '{}',
        {
          ...createDefaultDashboardPanelDraft(),
          layout: { x: '0', y: '0', w: '0', h: '1' }
        }
      )
    ).toEqual({
      ok: false,
      message: 'panel.layout.w 不能小于 1。'
    });
  });

  it('编辑和删除 panel 时更新 panels 数组', () => {
    const configText = JSON.stringify({
      refresh_seconds: 30,
      panels: [
        { id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } },
        { id: 'logs', title: '日志', type: 'logs', query: {}, layout: { x: 0, y: 3, w: 6, h: 3 } }
      ]
    });

    const edited = upsertDashboardPanelInConfigText(configText, {
      mode: 'edit',
      editIndex: 1,
      id: 'logs',
      title: '错误日志',
      type: 'logs',
      queryText: '{"level":"error"}',
      layout: { x: '6', y: '0', w: '6', h: '4' }
    });

    expect(edited).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        panels: [
          { id: 'cpu' },
          { id: 'logs', title: '错误日志', query: { level: 'error' }, layout: { x: 6, y: 0, w: 6, h: 4 } }
        ]
      }
    });

    const removed = edited.ok ? removeDashboardPanelFromConfigText(edited.configText, 0) : edited;
    expect(removed).toMatchObject({
      ok: true,
      value: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志' }]
      }
    });
  });
});
