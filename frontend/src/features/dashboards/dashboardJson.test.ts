import { describe, expect, it } from 'vitest';
import {
  createDefaultDashboardForm,
  dashboardToEditForm,
  formatDashboardJson,
  parseDashboardJsonField
} from './dashboardJson';
import type { Dashboard } from '../../api/dashboards';

const dashboard: Dashboard = {
  id: 7,
  project_id: 12,
  name: '服务总览',
  description: '值班视图',
  layout: [{ x: 0, y: 0, w: 6, h: 4 }],
  config: { refresh_seconds: 60 },
  created_by_user_id: 1,
  updated_by_user_id: 1,
  created_at: '2026-06-23T10:20:00Z',
  updated_at: '2026-06-23T10:30:00Z'
};

describe('dashboard JSON helpers', () => {
  it('只接受 JSON 对象或数组', () => {
    expect(parseDashboardJsonField('{"version":1}', 'layout')).toEqual({
      ok: true,
      value: { version: 1 }
    });
    expect(parseDashboardJsonField('[{"x":0}]', 'layout')).toEqual({
      ok: true,
      value: [{ x: 0 }]
    });
    expect(parseDashboardJsonField('"text"', 'layout')).toEqual({
      ok: false,
      message: 'layout 必须是 JSON 对象或数组。'
    });
  });

  it('无效 JSON 返回字段级错误', () => {
    expect(parseDashboardJsonField('{bad-json}', 'config')).toEqual({
      ok: false,
      message: 'config 不是有效 JSON。'
    });
  });

  it('默认创建表单使用项目 ID 和最小 layout/config', () => {
    expect(createDefaultDashboardForm('12')).toMatchObject({
      projectId: '12',
      name: '',
      layoutText: formatDashboardJson({ version: 1, widgets: [] }),
      configText: formatDashboardJson({ refresh_seconds: 30 })
    });
  });

  it('编辑表单从 dashboard 格式化 JSON', () => {
    expect(dashboardToEditForm(dashboard)).toEqual({
      dashboardId: 7,
      name: '服务总览',
      description: '值班视图',
      layoutText: JSON.stringify(dashboard.layout, null, 2),
      configText: JSON.stringify(dashboard.config, null, 2)
    });
  });
});
