import { describe, expect, it } from 'vitest';
import {
  createDashboardPanelPreviewModel,
  createDashboardPanelRemotePreviewModel,
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

  it('生成 metrics/logs/events/traces/topology 查询预览摘要', () => {
    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'latency',
        title: 'Latency',
        panel_type: 'metrics',
        query: {},
        preview: {
          kind: 'metrics',
          mode: 'aggregate',
          items: [
            {
              project_id: 12,
              name: 'http.duration',
              source: 'api',
              window_start: '2026-06-20T10:00:00Z',
              window_end: '2026-06-20T10:05:00Z',
              aggregation: 'avg',
              value: 15,
              sample_count: 2,
              unit: 'ms'
            }
          ]
        }
      })
    ).toMatchObject({
      title: '指标聚合',
      summary: '1 条聚合结果',
      lines: [{ label: 'http.duration / api', value: 'avg 15 ms / 样本 2 / 2026-06-20 10:00:00Z - 2026-06-20 10:05:00Z' }],
      emptyMessage: null,
      visualization: {
        kind: 'metrics',
        valueLabel: 'avg 15 ms',
        sampleCountLabel: '样本 2',
        windowLabel: '2026-06-20 10:00:00Z - 2026-06-20 10:05:00Z',
        bars: [
          {
            label: 'http.duration / api',
            valueLabel: 'avg 15 ms',
            sampleCountLabel: '样本 2',
            windowLabel: '2026-06-20 10:00:00Z - 2026-06-20 10:05:00Z',
            tone: 'info'
          }
        ],
        sparklinePath: null
      }
    });

    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'logs',
        title: 'Logs',
        panel_type: 'logs',
        query: {},
        preview: {
          kind: 'logs',
          mode: 'recent',
          items: [
            {
              id: 1,
              project_id: 12,
              level: 'error',
              message: 'boom',
              source: 'api',
              logger: null,
              trace_id: null,
              span_id: null,
              attributes: {},
              payload: {},
              occurred_at: null,
              received_at: '2026-06-20T10:01:00Z'
            }
          ]
        }
      })
    ).toMatchObject({
      title: '日志样例',
      summary: '1 条最近日志',
      lines: [
        {
          label: 'error / api / 2026-06-20 10:01:00Z',
          value: 'boom',
          marker: { label: 'error', ariaLabel: '日志级别 error，来源 api', tone: 'danger' }
        }
      ],
      visualization: null
    });

    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'events',
        title: 'Events',
        panel_type: 'events',
        query: {},
        preview: {
          kind: 'events',
          mode: 'recent',
          items: [
            {
              id: 2,
              project_id: 12,
              type: 'deployment',
              source: 'ci',
              payload: { version: '2026.6.20' },
              occurred_at: null,
              received_at: '2026-06-20T10:02:00Z'
            }
          ]
        }
      })
    ).toMatchObject({
      title: '事件样例',
      summary: '1 条最近事件',
      lines: [
        {
          label: 'deployment / ci / 2026-06-20 10:02:00Z',
          value: 'payload { version: "2026.6.20" }',
          marker: { label: 'deployment', ariaLabel: '事件类型 deployment，来源 ci', tone: 'neutral' }
        }
      ],
      visualization: null
    });

    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'traces',
        title: 'Traces',
        panel_type: 'traces',
        query: {},
        preview: {
          kind: 'traces',
          mode: 'recent',
          items: [
            {
              id: 3,
              project_id: 12,
              trace_id: 'trace-preview',
              span_id: 'api-root',
              parent_span_id: null,
              name: 'GET /orders',
              start_time: null,
              end_time: null,
              duration_ms: 100,
              status_code: 'ok',
              source: 'api',
              attributes: {},
              payload: {},
              occurred_at: null,
              received_at: '2026-06-20T10:03:00Z'
            }
          ]
        }
      })
    ).toMatchObject({
      title: 'Trace 样例',
      summary: '1 条最近 span',
      lines: [
        {
          label: 'trace-preview / api-root',
          value: 'GET /orders / ok / 100ms / api',
          marker: { label: 'ok', ariaLabel: 'Trace 状态 ok，来源 api', tone: 'success' }
        }
      ],
      visualization: null
    });

    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'topology',
        title: 'Topology',
        panel_type: 'topology',
        query: {},
        preview: {
          kind: 'topology',
          mode: 'topology',
          nodes: [
            {
              source: 'api',
              span_count: 2,
              trace_count: 1,
              error_span_count: 0,
              avg_duration_ms: 75,
              max_duration_ms: 100
            }
          ],
          edges: [
            {
              from_source: 'api',
              to_source: 'worker',
              call_count: 1,
              error_count: 1,
              avg_duration_ms: 50,
              max_duration_ms: 50
            }
          ]
        }
      })
    ).toMatchObject({
      title: 'Topology 摘要',
      summary: '2 个节点 / 1 条边',
      lines: [
        { label: 'api -> worker', value: '调用 1 / 错误 1 / avg 50ms / max 50ms' },
        { label: 'node api', value: 'spans 2 / traces 1 / errors 0' }
      ],
      visualization: {
        kind: 'topology',
        nodeLabel: '2 个节点',
        edgeLabel: '1 条边',
        nodes: [
          { id: 'api', label: 'api', spanCountLabel: 'spans 2', traceCountLabel: 'traces 1', errorCountLabel: 'errors 0' },
          { id: 'worker', label: 'worker', spanCountLabel: 'spans 0', traceCountLabel: 'traces 0', errorCountLabel: 'errors 0', tone: 'neutral' }
        ],
        edges: [
          {
            label: 'api -> worker',
            callCountLabel: '调用 1',
            errorCountLabel: '错误 1',
            durationLabel: 'avg 50ms / max 50ms',
            tone: 'danger'
          }
        ]
      }
    });
  });

  it('为多窗口 metrics 生成稳定 bar/sparkline 视觉模型', () => {
    const preview = createDashboardPanelRemotePreviewModel({
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'latency',
      title: 'Latency',
      panel_type: 'metrics',
      query: {},
      preview: {
        kind: 'metrics',
        mode: 'aggregate',
        items: [
          {
            project_id: 12,
            name: 'http.duration',
            source: 'api',
            window_start: '2026-06-20T10:00:00Z',
            window_end: '2026-06-20T10:05:00Z',
            aggregation: 'avg',
            value: 10,
            sample_count: 2,
            unit: 'ms'
          },
          {
            project_id: 12,
            name: 'http.duration',
            source: 'api',
            window_start: '2026-06-20T10:05:00Z',
            window_end: '2026-06-20T10:10:00Z',
            aggregation: 'avg',
            value: 20,
            sample_count: 3,
            unit: 'ms'
          },
          {
            project_id: 12,
            name: 'http.duration',
            source: 'worker',
            window_start: '2026-06-20T10:10:00Z',
            window_end: '2026-06-20T10:15:00Z',
            aggregation: 'avg',
            value: 5,
            sample_count: 4,
            unit: 'ms'
          }
        ]
      }
    });

    expect(preview.visualization).toMatchObject({
      kind: 'metrics',
      valueLabel: 'avg 5 ms',
      sampleCountLabel: '样本 9',
      windowLabel: '2026-06-20 10:00:00Z - 2026-06-20 10:15:00Z',
      bars: [
        { label: 'http.duration / api', valueLabel: 'avg 10 ms', sampleCountLabel: '样本 2' },
        { label: 'http.duration / api', valueLabel: 'avg 20 ms', sampleCountLabel: '样本 3' },
        { label: 'http.duration / worker', valueLabel: 'avg 5 ms', sampleCountLabel: '样本 4' }
      ]
    });
    expect(preview.visualization?.kind === 'metrics' ? preview.visualization.sparklinePath : null).toContain('L');
  });

  it('为负值和单点 metrics 保留零轴并生成最小柱高', () => {
    const preview = createDashboardPanelRemotePreviewModel({
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'delta',
      title: 'Delta',
      panel_type: 'metrics',
      query: {},
      preview: {
        kind: 'metrics',
        mode: 'aggregate',
        items: [
          {
            project_id: 12,
            name: 'queue.delta',
            source: null,
            window_start: '2026-06-20T10:00:00Z',
            window_end: '2026-06-20T10:01:00Z',
            aggregation: 'sum',
            value: -3,
            sample_count: 1,
            unit: null
          }
        ]
      }
    });

    expect(preview.visualization).toMatchObject({
      kind: 'metrics',
      valueLabel: 'sum -3',
      sampleCountLabel: '样本 1',
      sparklinePath: null,
      bars: [
        {
          label: 'queue.delta / unknown',
          valueLabel: 'sum -3',
          sampleCountLabel: '样本 1',
          tone: 'warning'
        }
      ]
    });
    if (preview.visualization?.kind === 'metrics') {
      expect(preview.visualization.bars[0].height).toBeGreaterThanOrEqual(3);
      expect(preview.visualization.bars[0].y).toBeGreaterThanOrEqual(preview.visualization.axisY);
    }
  });

  it('为正负混合 metrics sparkline 使用真实值坐标而不是柱形顶点', () => {
    const preview = createDashboardPanelRemotePreviewModel({
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'delta',
      title: 'Delta',
      panel_type: 'metrics',
      query: {},
      preview: {
        kind: 'metrics',
        mode: 'aggregate',
        items: [
          {
            project_id: 12,
            name: 'queue.delta',
            source: 'api',
            window_start: '2026-06-20T10:00:00Z',
            window_end: '2026-06-20T10:01:00Z',
            aggregation: 'sum',
            value: -3,
            sample_count: 1,
            unit: null
          },
          {
            project_id: 12,
            name: 'queue.delta',
            source: 'api',
            window_start: '2026-06-20T10:01:00Z',
            window_end: '2026-06-20T10:02:00Z',
            aggregation: 'sum',
            value: 6,
            sample_count: 1,
            unit: null
          }
        ]
      }
    });

    if (preview.visualization?.kind !== 'metrics') {
      throw new Error('expected metrics visualization');
    }

    const negativeBar = preview.visualization.bars[0];
    const positiveBar = preview.visualization.bars[1];

    expect(negativeBar.y).toBe(preview.visualization.axisY);
    expect(negativeBar.pointY).toBeGreaterThan(preview.visualization.axisY);
    expect(positiveBar.pointY).toBeLessThan(preview.visualization.axisY);
    expect(preview.visualization.sparklinePath).toContain(`${negativeBar.x + negativeBar.width / 2} ${negativeBar.pointY}`);
    expect(preview.visualization.sparklinePath).toContain(`${positiveBar.x + positiveBar.width / 2} ${positiveBar.pointY}`);
  });

  it('为 5 节点 topology 保持节点标签在 SVG 视图范围内', () => {
    const preview = createDashboardPanelRemotePreviewModel({
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'topology',
      title: 'Topology',
      panel_type: 'topology',
      query: {},
      preview: {
        kind: 'topology',
        mode: 'topology',
        nodes: [
          { source: 'api', span_count: 20, trace_count: 8, error_span_count: 0, avg_duration_ms: 20, max_duration_ms: 40 },
          { source: 'worker', span_count: 16, trace_count: 7, error_span_count: 0, avg_duration_ms: 30, max_duration_ms: 50 },
          { source: 'db', span_count: 12, trace_count: 6, error_span_count: 0, avg_duration_ms: 40, max_duration_ms: 60 },
          { source: 'cache', span_count: 8, trace_count: 5, error_span_count: 0, avg_duration_ms: 50, max_duration_ms: 70 },
          { source: 'queue', span_count: 4, trace_count: 4, error_span_count: 0, avg_duration_ms: 60, max_duration_ms: 80 }
        ],
        edges: []
      }
    });

    if (preview.visualization?.kind !== 'topology') {
      throw new Error('expected topology visualization');
    }

    expect(preview.visualization.nodes).toHaveLength(5);
    expect(preview.visualization.nodes.every((node) => node.y + node.radius + 12 <= 112)).toBe(true);
  });

  it('为只返回边的 topology 合成缺失节点并保留可视摘要', () => {
    const preview = createDashboardPanelRemotePreviewModel({
      project_id: 12,
      dashboard_id: 7,
      panel_id: 'topology',
      title: 'Topology',
      panel_type: 'topology',
      query: {},
      preview: {
        kind: 'topology',
        mode: 'topology',
        nodes: [],
        edges: [
          {
            from_source: 'api',
            to_source: 'background-worker-long-name',
            call_count: 4,
            error_count: 0,
            avg_duration_ms: null,
            max_duration_ms: 120
          }
        ]
      }
    });

    expect(preview).toMatchObject({
      emptyMessage: null,
      visualization: {
        kind: 'topology',
        nodeLabel: '2 个节点',
        edgeLabel: '1 条边',
        nodes: [
          { id: 'api', chartLabel: 'api', tone: 'neutral' },
          { id: 'background-worker-long-name', chartLabel: 'backgro...', tone: 'neutral' }
        ],
        edges: [
          {
            label: 'api -> background-worker-long-name',
            callCountLabel: '调用 4',
            errorCountLabel: '错误 0',
            durationLabel: 'avg - / max 120ms',
            tone: 'info'
          }
        ]
      }
    });
  });

  it('生成空查询预览提示', () => {
    expect(
      createDashboardPanelRemotePreviewModel({
        project_id: 12,
        dashboard_id: 7,
        panel_id: 'empty',
        title: 'Empty',
        panel_type: 'logs',
        query: {},
        preview: {
          kind: 'logs',
          mode: 'recent',
          items: []
        }
      })
    ).toMatchObject({
      lines: [],
      emptyMessage: '没有匹配的日志样例。',
      visualization: null
    });
  });
});
