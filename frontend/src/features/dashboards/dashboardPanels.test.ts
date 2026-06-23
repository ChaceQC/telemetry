import { describe, expect, it } from 'vitest';
import {
  createDashboardPanelPreviewModel,
  createDefaultDashboardPanelDraft,
  normalizeDashboardConfigPanels,
  readDashboardPanelsFromConfigText,
  removeDashboardPanelFromConfigText,
  summarizeDashboardPanelQuery,
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
      originalPanelId: 'logs',
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

  it('编辑 panel 时拒绝旧 index 已不再指向原 panel id 的草稿', () => {
    const draft = {
      mode: 'edit' as const,
      editIndex: 1,
      originalPanelId: 'logs',
      id: 'logs',
      title: '错误日志',
      type: 'logs' as const,
      queryText: '{"level":"error"}',
      layout: { x: '6', y: '0', w: '6', h: '4' }
    };
    const reordered = JSON.stringify({
      panels: [
        { id: 'logs', title: '日志', type: 'logs', query: {}, layout: { x: 0, y: 3, w: 6, h: 3 } },
        { id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }
      ]
    });
    const deleted = JSON.stringify({
      panels: [{ id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
    });

    expect(upsertDashboardPanelInConfigText(reordered, draft)).toEqual({
      ok: false,
      message: '当前 config.panels 已变化，请重新选择要更新的 panel。'
    });
    expect(upsertDashboardPanelInConfigText(deleted, draft)).toEqual({
      ok: false,
      message: '当前 config.panels 已变化，请重新选择要更新的 panel。'
    });
  });

  it('生成 panel 预览时按 layout y/x 排序并保留原始 index', () => {
    const readResult = readDashboardPanelsFromConfigText(
      JSON.stringify({
        panels: [
          {
            id: 'logs',
            title: '日志',
            type: 'logs',
            query: { level: 'error' },
            layout: { x: 6, y: 3, w: 6, h: 3 }
          },
          {
            id: 'cpu',
            title: 'CPU',
            type: 'metrics',
            query: {},
            layout: { x: 0, y: 0, w: 6, h: 4 }
          },
          {
            id: 'events',
            title: '事件',
            type: 'events',
            query: {}
          }
        ]
      })
    );

    const preview = createDashboardPanelPreviewModel(readResult);

    expect(preview).toMatchObject({
      state: 'ready',
      statusLabel: '3 个 panel',
      columns: 12,
      panels: [
        {
          id: 'cpu',
          originalIndex: 1,
          layoutLabel: 'x 0 / y 0 / w 6 / h 4',
          gridColumn: '1 / span 6',
          querySummary: 'query {}'
        },
        {
          id: 'logs',
          originalIndex: 0,
          layoutLabel: 'x 6 / y 3 / w 6 / h 3',
          gridColumn: '7 / span 6',
          querySummary: 'query { level: "error" }'
        },
        {
          id: 'events',
          originalIndex: 2,
          layoutLabel: 'no layout',
          gridColumn: '1 / -1'
        }
      ]
    });
  });

  it('生成 panel 预览状态时区分 legacy、empty 和 invalid config.panels', () => {
    expect(createDashboardPanelPreviewModel(readDashboardPanelsFromConfigText('{"refresh_seconds":30}'))).toEqual({
      state: 'legacy',
      statusLabel: 'Legacy',
      message: '当前 config 未包含 panels。',
      panels: []
    });

    expect(createDashboardPanelPreviewModel(readDashboardPanelsFromConfigText('{"panels":[]}'))).toEqual({
      state: 'empty',
      statusLabel: '0 个 panel',
      message: '当前 config.panels 数组为空。',
      panels: []
    });

    expect(createDashboardPanelPreviewModel(readDashboardPanelsFromConfigText('{"panels":{}}'))).toEqual({
      state: 'invalid',
      statusLabel: '配置错误',
      message: 'config.panels 必须是数组。',
      panels: []
    });
  });

  it('生成稳定 query 摘要，兼容空对象、嵌套对象数组和长字符串', () => {
    expect(summarizeDashboardPanelQuery({})).toBe('query {}');
    expect(
      summarizeDashboardPanelQuery({
        tags: ['prod', 'api', { service: 'payments' }, 'extra'],
        filters: {
          level: 'error',
          source: 'worker',
          nested: { request_id: 'req-1' },
          extra: true
        },
        message:
          'this is a deliberately long query string that should be shortened before it reaches the panel preview UI',
        limit: 100,
        offset: 0
      })
    ).toBe(
      'query { filters: {4 keys: extra, level, nested, ...}, limit: 100, message: "this is a deliberately long query string that..." (104 chars), offset: 0, +1 keys }'
    );
  });
});
