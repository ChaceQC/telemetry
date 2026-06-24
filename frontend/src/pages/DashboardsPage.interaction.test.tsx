// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, DashboardListParams, DashboardPanelPreviewResponse } from '../api/dashboards';
import { ApiClientError } from '../api/http';
import type { Project } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { DASHBOARD_JSON_MAX_BYTES, DASHBOARD_JSON_MAX_DEPTH } from '../features/dashboards/dashboardJson';
import { DashboardsPage } from './DashboardsPage';

type DashboardListResult = { items: Dashboard[]; limit: number; offset: number; total: number };

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn<() => Promise<Project[]>>(),
  listDashboards: vi.fn<(params?: DashboardListParams) => Promise<DashboardListResult>>(),
  previewDashboardPanel:
    vi.fn<
      (projectId: number, dashboardId: number, panelId: string, variables?: Record<string, string | number>) => Promise<DashboardPanelPreviewResponse>
    >(),
  createDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  deleteDashboard: vi.fn()
}));

vi.mock('../api/settings', () => ({
  listProjects: apiMocks.listProjects
}));

vi.mock('../api/dashboards', () => ({
  createDashboard: apiMocks.createDashboard,
  deleteDashboard: apiMocks.deleteDashboard,
  listDashboards: apiMocks.listDashboards,
  previewDashboardPanel: apiMocks.previewDashboardPanel,
  updateDashboard: apiMocks.updateDashboard
}));

const project: Project = {
  id: 12,
  name: '核心平台',
  key: 'core-platform',
  description: '主项目'
};

const otherProject: Project = {
  id: 34,
  name: '支付平台',
  key: 'payments',
  description: '第二项目'
};

const dashboard: Dashboard = createDashboardFixture({
  id: 7,
  project_id: project.id,
  name: 'SLO 值班看板',
  description: '核心服务面板',
  layout: { version: 1, widgets: [] },
  config: { refresh_seconds: 30 }
});

function createDashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 7,
    project_id: project.id,
    name: 'SLO 值班看板',
    description: '核心服务面板',
    layout: { version: 1, widgets: [] },
    config: { refresh_seconds: 30 },
    created_by_user_id: 1,
    updated_by_user_id: 1,
    created_at: '2026-06-23T10:20:00Z',
    updated_at: '2026-06-23T10:30:00Z',
    ...overrides
  };
}

function createSignedInAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: {
      id: 2,
      username: 'operator',
      display_name: 'Operator',
      email: null,
      roles: []
    },
    isAuthenticated: true,
    isRestoring: false,
    canRequestAuthenticatedApi: true,
    sessionRevision: 1,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null),
    ...overrides
  };
}

function createSignedOutAuth(sessionRevision = 1): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isRestoring: false,
    canRequestAuthenticatedApi: false,
    sessionRevision,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null)
  };
}

function renderPage(element: ReactElement, auth: AuthContextValue = createSignedInAuth()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });

  const buildTree = (authValue: AuthContextValue, page: ReactElement = element) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/dashboards']}>{page}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

  const view = render(buildTree(auth));

  return {
    ...view,
    queryClient,
    rerenderWithAuth: (nextAuth: AuthContextValue, page: ReactElement = element) => view.rerender(buildTree(nextAuth, page))
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.listProjects.mockResolvedValue([project]);
  apiMocks.listDashboards.mockResolvedValue({ items: [dashboard], limit: 50, offset: 0, total: 1 });
  apiMocks.previewDashboardPanel.mockResolvedValue({
    project_id: project.id,
    dashboard_id: dashboard.id,
    panel_id: 'logs',
    title: '错误日志',
    panel_type: 'logs',
    query: {},
    preview: {
      kind: 'logs',
      mode: 'recent',
      items: []
    }
  });
  apiMocks.createDashboard.mockResolvedValue({ ...dashboard, id: 8, name: '新建看板' });
  apiMocks.updateDashboard.mockResolvedValue({ ...dashboard, name: '服务健康概览', description: null });
  apiMocks.deleteDashboard.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DashboardsPage interactions', () => {
  it('支持创建 dashboard 并提交解析后的 layout/config', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();

    await user.clear(within(createPanel as HTMLElement).getByLabelText('项目 ID'));
    await user.type(within(createPanel as HTMLElement).getByLabelText('项目 ID'), '12');
    await user.type(within(createPanel as HTMLElement).getByLabelText('名称'), '新建看板');
    await user.type(within(createPanel as HTMLElement).getByLabelText('描述'), '值班入口');
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: '{"version":1,"widgets":[]}' }
    });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: '{"refresh_seconds":45}' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(apiMocks.createDashboard.mock.calls[0]?.[0]).toEqual({
      project_id: 12,
      name: '新建看板',
      description: '值班入口',
      layout: { version: 1, widgets: [] },
      config: { refresh_seconds: 45 }
    });
  });

  it('选择列表项后可更新名称、清空描述并删除 dashboard', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();

    await user.clear(within(editPanel as HTMLElement).getByLabelText('名称'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('名称'), '服务健康概览');
    await user.clear(within(editPanel as HTMLElement).getByLabelText('描述'));
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: '{"refresh_seconds":60}' }
    });
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([12, 7, {
      name: '服务健康概览',
      description: null,
      config: { refresh_seconds: 60 }
    }]);

    await user.click(screen.getByTitle('删除仪表盘'));

    expect(apiMocks.deleteDashboard).toHaveBeenCalledWith(12, 7);
  });

  it('可在编辑区写入 relative 全局时间范围并通过既有更新接口保存 config', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');

    expect(within(timeRangeEditor).getAllByText('未配置').length).toBeGreaterThan(0);
    await user.click(within(timeRangeEditor).getByRole('radio', { name: 'Relative' }));
    fireEvent.change(within(timeRangeEditor).getByRole('combobox', { name: 'Relative' }), { target: { value: '7d' } });

    const configText = (within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value;
    expect(JSON.parse(configText)).toEqual({
      refresh_seconds: 30,
      time_range: {
        mode: 'relative',
        relative: '7d'
      }
    });

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([
      12,
      7,
      {
        config: {
          refresh_seconds: 30,
          time_range: {
            mode: 'relative',
            relative: '7d'
          }
        }
      }
    ]);
  });

  it('可在编辑区写入 absolute 全局时间范围并保存 trimmed ISO 字符串', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');

    await user.click(within(timeRangeEditor).getByRole('radio', { name: 'Absolute' }));
    fireEvent.change(within(timeRangeEditor).getByLabelText('From ISO'), {
      target: { value: ' 2026-06-24T00:00:00Z ' }
    });
    fireEvent.change(within(timeRangeEditor).getByLabelText('To ISO'), {
      target: { value: '\t2026-06-24T01:00:00+00:00\n' }
    });

    expect(JSON.parse((within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value)).toEqual({
      refresh_seconds: 30,
      time_range: {
        mode: 'absolute',
        from: '2026-06-24T00:00:00Z',
        to: '2026-06-24T01:00:00+00:00'
      }
    });

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([
      12,
      7,
      {
        config: {
          refresh_seconds: 30,
          time_range: {
            mode: 'absolute',
            from: '2026-06-24T00:00:00Z',
            to: '2026-06-24T01:00:00+00:00'
          }
        }
      }
    ]);
  });

  it('从合法 absolute 改成非法日期时不会污染 config.time_range 草稿', async () => {
    const user = userEvent.setup();
    const dashboardWithAbsoluteTimeRange = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        time_range: {
          mode: 'absolute',
          from: '2026-06-24T00:00:00Z',
          to: '2026-06-24T01:00:00Z'
        }
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [dashboardWithAbsoluteTimeRange], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');
    const configJson = within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement;

    fireEvent.change(within(timeRangeEditor).getByLabelText('From ISO'), {
      target: { value: '2026-02-31T00:00:00Z' }
    });

    expect(within(timeRangeEditor).getByText('time_range 配置错误')).toBeTruthy();
    expect(within(timeRangeEditor).getAllByText('config.time_range.from 必须是 ISO 8601 时间字符串。')).toHaveLength(2);
    expect((within(timeRangeEditor).getByLabelText('From ISO') as HTMLInputElement).value).toBe('2026-02-31T00:00:00Z');
    expect(JSON.parse(configJson.value)).toEqual({
      refresh_seconds: 30,
      time_range: {
        mode: 'absolute',
        from: '2026-06-24T00:00:00Z',
        to: '2026-06-24T01:00:00Z'
      }
    });

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect((await screen.findAllByText('config.time_range.from 必须是 ISO 8601 时间字符串。')).length).toBeGreaterThan(0);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('从 legacy config 输入非法 absolute 时不会写入非法 time_range', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');
    const configJson = within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement;

    await user.click(within(timeRangeEditor).getByRole('radio', { name: 'Absolute' }));
    fireEvent.change(within(timeRangeEditor).getByLabelText('From ISO'), {
      target: { value: '2026-02-31T00:00:00Z' }
    });

    expect(within(timeRangeEditor).getByText('time_range 配置错误')).toBeTruthy();
    expect((within(timeRangeEditor).getByLabelText('From ISO') as HTMLInputElement).value).toBe('2026-02-31T00:00:00Z');
    expect(JSON.parse(configJson.value)).toEqual({ refresh_seconds: 30 });
    expect(JSON.parse(configJson.value)).not.toHaveProperty('time_range');
  });

  it('非法 absolute 全局时间范围不会通过编辑保存接口提交', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify({
          refresh_seconds: 30,
          time_range: {
            mode: 'absolute',
            from: '2026-02-31T00:00:00Z',
            to: '2026-03-01T00:00:00Z'
          }
        })
      }
    });

    expect(within(timeRangeEditor).getByText('time_range 配置错误')).toBeTruthy();
    expect(within(timeRangeEditor).getAllByText('config.time_range.from 必须是 ISO 8601 时间字符串。')).toHaveLength(2);
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect((await screen.findAllByText('config.time_range.from 必须是 ISO 8601 时间字符串。')).length).toBeGreaterThan(0);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('在编辑区添加 panel 后通过既有更新接口保存 config.panels', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const panelEditor = within(editPanel as HTMLElement).getByLabelText('Panel 配置');
    expect(within(panelEditor).getByText('Legacy config')).toBeTruthy();

    await user.clear(within(editPanel as HTMLElement).getByLabelText('Panel ID'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('Panel ID'), ' cpu ');
    await user.clear(within(editPanel as HTMLElement).getByLabelText('标题'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('标题'), ' CPU 使用率 ');
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('panel query JSON'), {
      target: { value: '{"name":"cpu.usage"}' }
    });
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('y'), { target: { value: '1' } });
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('h'), { target: { value: '3' } });
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '添加 panel' }));

    await waitFor(() => {
      expect((within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value).toContain(
        '"panels"'
      );
    });
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');
    expect(within(preview).getByText('CPU 使用率')).toBeTruthy();
    expect(within(preview).getByText('metrics / cpu')).toBeTruthy();
    expect(within(preview).getByText('x 0 / y 1 / w 6 / h 3')).toBeTruthy();
    expect(within(preview).getByText('query { name: "cpu.usage" }')).toBeTruthy();

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([
      12,
      7,
      {
        config: {
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
      }
    ]);
  });

  it('手动修改 config JSON 后只读 panel 预览立即同步且不保存', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    expect(within(preview).getByText('Legacy config')).toBeTruthy();
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify(
          {
            refresh_seconds: 30,
            panels: [
              {
                id: 'logs',
                title: '错误日志',
                type: 'logs',
                query: {
                  level: 'error',
                  tags: ['prod', 'api', { service: 'payments' }],
                  text: 'a very long keyword search expression that should not overflow the preview surface'
                },
                layout: { x: 6, y: 2, w: 6, h: 3 }
              },
              {
                id: 'cpu',
                title: 'CPU 使用率',
                type: 'metrics',
                query: {},
                layout: { x: 0, y: 0, w: 6, h: 4 }
              }
            ]
          },
          null,
          2
        )
      }
    });

    expect(within(preview).getByText('2 个 panel')).toBeTruthy();
    expect(within(preview).getByText('CPU 使用率')).toBeTruthy();
    expect(within(preview).getByText('metrics / cpu')).toBeTruthy();
    expect(within(preview).getByText('query {}')).toBeTruthy();
    expect(within(preview).getByText('错误日志')).toBeTruthy();
    expect(within(preview).getByText('logs / logs')).toBeTruthy();
    expect(within(preview).getByText('x 6 / y 2 / w 6 / h 3')).toBeTruthy();
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('手动修改 config.time_range 后全局时间范围表单立即同步且不保存', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify(
          {
            refresh_seconds: 30,
            time_range: {
              mode: 'relative',
              relative: '6h'
            }
          },
          null,
          2
        )
      }
    });

    expect((within(timeRangeEditor).getByRole('radio', { name: 'Relative' }) as HTMLInputElement).checked).toBe(true);
    expect((within(timeRangeEditor).getByRole('combobox', { name: 'Relative' }) as HTMLSelectElement).value).toBe('6h');
    expect(within(timeRangeEditor).getByText('最近 6h')).toBeTruthy();
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('非法或非对象 config 会显示全局时间范围状态且避免覆盖 JSON 草稿', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const timeRangeEditor = within(editPanel as HTMLElement).getByLabelText('全局时间范围');

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: '{"time_range":{"mode":"relative","relative":"10m"}}' }
    });

    expect(within(timeRangeEditor).getByText('time_range 配置错误')).toBeTruthy();
    expect(within(timeRangeEditor).getAllByText('config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一。')).toHaveLength(2);
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect((await screen.findAllByText('config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一。')).length).toBeGreaterThan(0);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: '[]' }
    });

    expect(within(timeRangeEditor).getByText('时间范围不可编辑')).toBeTruthy();
    expect(within(timeRangeEditor).getAllByText('config 必须是 JSON 对象才能使用 time_range。')).toHaveLength(2);
    expect(within(timeRangeEditor).queryByRole('radio', { name: 'Relative' })).toBeNull();
    expect((within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value).toBe('[]');
  });

  it('可在编辑区添加变量并通过既有更新接口保存 config.variables', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const variableEditor = within(editPanel as HTMLElement).getByLabelText('变量配置');
    expect(within(variableEditor).getByText('Legacy config')).toBeTruthy();

    await user.clear(within(variableEditor).getByLabelText('Name'));
    await user.type(within(variableEditor).getByLabelText('Name'), ' env ');
    await user.type(within(variableEditor).getByLabelText('Label'), ' Environment ');
    fireEvent.change(within(variableEditor).getByLabelText('Type'), { target: { value: 'select' } });
    await user.type(within(variableEditor).getByLabelText('Default'), ' prod ');
    fireEvent.change(within(variableEditor).getByLabelText('variable options'), {
      target: { value: ' prod, staging\nprod ' }
    });
    await user.click(within(variableEditor).getByRole('button', { name: '添加变量' }));

    const configJson = within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement;
    expect(JSON.parse(configJson.value)).toEqual({
      refresh_seconds: 30,
      variables: [
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          default: 'prod',
          options: ['prod', 'staging']
        }
      ]
    });
    expect(within(variableEditor).getByText('Environment')).toBeTruthy();
    expect(within(variableEditor).getByText('env / select')).toBeTruthy();
    expect(within(variableEditor).getByText('prod, staging')).toBeTruthy();

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([
      12,
      7,
      {
        config: {
          refresh_seconds: 30,
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
      }
    ]);
  });

  it('可编辑和删除 config.variables 中的变量', async () => {
    const user = userEvent.setup();
    const dashboardWithVariables = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        variables: [
          { name: 'env', label: '环境', type: 'select', options: ['prod', 'staging'], default: 'prod' },
          { name: 'sample_rate', type: 'number', default: 1 }
        ]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [dashboardWithVariables], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const variableEditor = within(editPanel as HTMLElement).getByLabelText('变量配置');

    await user.click(within(variableEditor).getByRole('button', { name: /sample_rate \/ number/ }));
    await user.type(within(variableEditor).getByLabelText('Label'), 'Sample rate');
    await user.clear(within(variableEditor).getByLabelText('Default'));
    await user.type(within(variableEditor).getByLabelText('Default'), '0.25');
    await user.click(within(variableEditor).getByRole('button', { name: '更新变量' }));
    await user.click(within(variableEditor).getAllByTitle('删除变量')[0]);

    const configJson = within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement;
    expect(JSON.parse(configJson.value)).toEqual({
      refresh_seconds: 30,
      variables: [
        {
          name: 'sample_rate',
          label: 'Sample rate',
          type: 'number',
          default: 0.25
        }
      ]
    });
  });

  it('编辑 text 变量时保留显式空字符串 default', async () => {
    const user = userEvent.setup();
    const dashboardWithVariables = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        variables: [{ name: 'service_name', type: 'text', default: '' }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [dashboardWithVariables], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const variableEditor = within(editPanel as HTMLElement).getByLabelText('变量配置');

    await user.click(within(variableEditor).getByRole('button', { name: /service_name \/ text/ }));
    expect((within(variableEditor).getByRole('checkbox', { name: '使用' }) as HTMLInputElement).checked).toBe(true);
    expect((within(variableEditor).getByLabelText('Default') as HTMLInputElement).value).toBe('');
    await user.type(within(variableEditor).getByLabelText('Label'), 'Service');
    await user.click(within(variableEditor).getByRole('button', { name: '更新变量' }));

    const configJson = within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement;
    expect(JSON.parse(configJson.value)).toEqual({
      refresh_seconds: 30,
      variables: [{ name: 'service_name', label: 'Service', type: 'text', default: '' }]
    });
  });

  it('非法变量草稿和手写 config.variables 会被本地拦截且不保存', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const variableEditor = within(editPanel as HTMLElement).getByLabelText('变量配置');

    await user.clear(within(variableEditor).getByLabelText('Name'));
    await user.type(within(variableEditor).getByLabelText('Name'), '1env');
    await user.click(within(variableEditor).getByRole('button', { name: '添加变量' }));

    expect(await screen.findByText('variable.name 只能包含字母、数字和下划线，且不能以数字开头。')).toBeTruthy();
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify({
          refresh_seconds: 30,
          variables: [{ name: 'env', type: 'select', options: ['prod'], default: 'staging' }]
        })
      }
    });

    expect(within(variableEditor).getByText('变量配置不可用')).toBeTruthy();
    expect(within(variableEditor).getAllByText('config.variables[0].default 必须匹配 options 中的一个值。')).toHaveLength(2);
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect((await screen.findAllByText('config.variables[0].default 必须匹配 options 中的一个值。')).length).toBeGreaterThan(0);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify({
          refresh_seconds: 30,
          variables: [
            { name: 'env', type: 'text' },
            { name: ' env ', type: 'select', options: ['prod'] }
          ]
        })
      }
    });
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect((await screen.findAllByText('config.variables[1].name 不能重复。')).length).toBeGreaterThan(0);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('手动修改 config.variables 后变量列表立即同步且不保存', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const variableEditor = within(editPanel as HTMLElement).getByLabelText('变量配置');

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify(
          {
            refresh_seconds: 30,
            variables: [
              { name: 'service_name', label: 'Service', type: 'text', default: 'checkout' },
              { name: 'env', type: 'select', options: ['prod', 'staging'], default: 'prod' }
            ]
          },
          null,
          2
        )
      }
    });

    expect(within(variableEditor).getByText('2 个变量')).toBeTruthy();
    expect(within(variableEditor).getByText('Service')).toBeTruthy();
    expect(within(variableEditor).getByText('service_name / text')).toBeTruthy();
    expect(within(variableEditor).getByText('env / select')).toBeTruthy();
    expect(within(variableEditor).getByText('prod, staging')).toBeTruthy();
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('为已保存 panel 按需加载后端查询预览样例', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: { level: 'error' }, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'logs',
      title: '错误日志',
      panel_type: 'logs',
      query: { level: 'error' },
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: [
          {
            id: 101,
            project_id: project.id,
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
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledWith(12, 7, 'logs'));
    expect(apiMocks.previewDashboardPanel.mock.calls[0]).toEqual([12, 7, 'logs']);
    expect(await within(preview).findByText('日志样例')).toBeTruthy();
    expect(within(preview).getByText('1 条最近日志')).toBeTruthy();
    expect(within(preview).getByLabelText('日志级别 error，来源 api')).toBeTruthy();
    expect(within(preview).getByText('error / api / 2026-06-20 10:01:00Z')).toBeTruthy();
    expect(within(preview).getByText('boom')).toBeTruthy();
  });

  it('可为已保存 panel 开启和关闭本地自动刷新且不写入 dashboard config', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: { level: 'error' }, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'logs',
      title: '错误日志',
      panel_type: 'logs',
      query: { level: 'error' },
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));
    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(1));
    const autoRefreshSelect = within(preview).getByRole('combobox', { name: '自动刷新' }) as HTMLSelectElement;
    expect(autoRefreshSelect.value).toBe('0');

    vi.useFakeTimers();
    fireEvent.change(autoRefreshSelect, { target: { value: '15' } });
    expect(within(preview).getByText('每 15s')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(2);
    expect(apiMocks.previewDashboardPanel.mock.calls[1]).toEqual([12, 7, 'logs']);

    fireEvent.change(autoRefreshSelect, { target: { value: '0' } });
    expect(within(preview).queryByText('每 15s')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(2);
    vi.useRealTimers();

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('名称'), { target: { value: 'SLO 值班看板 v2' } });
    fireEvent.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(apiMocks.updateDashboard).toHaveBeenCalled());
    expect(apiMocks.updateDashboard.mock.calls[0]?.slice(0, 3)).toEqual([
      12,
      7,
      {
        name: 'SLO 值班看板 v2'
      }
    ]);
  });

  it('config 草稿变更会停止旧 panel 自动刷新', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'logs',
      title: '错误日志',
      panel_type: 'logs',
      query: {},
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));
    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.change(within(preview).getByRole('combobox', { name: '自动刷新' }), { target: { value: '15' } });

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify(
          {
            refresh_seconds: 30,
            panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: { level: 'warn' }, layout: { x: 0, y: 0, w: 6, h: 3 } }]
          },
          null,
          2
        )
      }
    });

    expect(within(preview).queryByText('每 15s')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(1);
  });

  it('自动刷新不会和未完成的手动刷新并发请求', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    const previewResponse: DashboardPanelPreviewResponse = {
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'logs',
      title: '错误日志',
      panel_type: 'logs',
      query: {},
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    };
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue(previewResponse);
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));
    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    fireEvent.change(within(preview).getByRole('combobox', { name: '自动刷新' }), { target: { value: '15' } });
    const manualRefresh = createDeferred<DashboardPanelPreviewResponse>();
    apiMocks.previewDashboardPanel.mockImplementationOnce(() => manualRefresh.promise);

    await act(async () => {
      fireEvent.click(within(preview).getByRole('button', { name: '刷新预览' }));
      await Promise.resolve();
    });
    expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(2);

    await act(async () => {
      manualRefresh.resolve(previewResponse);
      await manualRefresh.promise;
    });
  });

  it('panel 查询预览可携带运行时变量覆盖且不会写回 dashboard config', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        variables: [
          { name: 'service_source', label: 'Service', type: 'text', default: 'api' },
          { name: 'empty_keyword', label: 'Keyword', type: 'text' },
          { name: 'row_limit', label: 'Rows', type: 'number', default: 10 },
          { name: 'log_level', label: 'Level', type: 'select', options: ['error', 'warn'], default: 'error' }
        ],
        panels: [
          {
            id: 'logs',
            title: '错误日志',
            type: 'logs',
            query: { source: '${service_source}', keyword: '${empty_keyword}', level: '${log_level}', limit: '${row_limit}' },
            layout: { x: 0, y: 0, w: 6, h: 3 }
          }
        ]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel
      .mockResolvedValueOnce({
        project_id: project.id,
        dashboard_id: panelDashboard.id,
        panel_id: 'logs',
        title: '错误日志',
        panel_type: 'logs',
        query: { source: '${service_source}', keyword: '${empty_keyword}', level: '${log_level}', limit: '${row_limit}' },
        preview: {
          kind: 'logs',
          mode: 'recent',
          items: []
        }
      })
      .mockResolvedValueOnce({
        project_id: project.id,
        dashboard_id: panelDashboard.id,
        panel_id: 'logs',
        title: '错误日志',
        panel_type: 'logs',
        query: { source: '${service_source}', keyword: '${empty_keyword}', level: '${log_level}', limit: '${row_limit}' },
        preview: {
          kind: 'logs',
          mode: 'recent',
          items: []
        }
      });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');
    const runtimeVariables = within(preview).getByLabelText('运行时变量值');

    expect(within(runtimeVariables).getByPlaceholderText('default api')).toBeTruthy();
    expect(within(runtimeVariables).getByText('4 个变量')).toBeTruthy();

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));
    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledWith(12, 7, 'logs'));

    await user.clear(within(runtimeVariables).getByLabelText('运行时变量 service_source'));
    await user.type(within(runtimeVariables).getByLabelText('运行时变量 service_source'), 'worker');
    await user.type(within(runtimeVariables).getByLabelText('运行时变量 empty_keyword'), 'timeout');
    await user.clear(within(runtimeVariables).getByLabelText('运行时变量 row_limit'));
    await user.type(within(runtimeVariables).getByLabelText('运行时变量 row_limit'), '25');
    await user.selectOptions(within(runtimeVariables).getByLabelText('运行时变量 log_level'), 'warn');
    await user.click(within(preview).getByRole('button', { name: '刷新预览' }));

    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledTimes(2));
    expect(apiMocks.previewDashboardPanel.mock.calls[1]).toEqual([
      12,
      7,
      'logs',
      {
        service_source: 'worker',
        empty_keyword: 'timeout',
        row_limit: 25,
        log_level: 'warn'
      }
    ]);
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();

    await user.clear(within(editPanel as HTMLElement).getByLabelText('名称'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('名称'), 'SLO 值班看板 v2');
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));
    const savedPayload = apiMocks.updateDashboard.mock.calls[0]?.[2];
    expect(savedPayload).toEqual({
      name: 'SLO 值班看板 v2'
    });
    expect(JSON.stringify(savedPayload)).not.toContain('worker');
    expect(JSON.stringify(savedPayload)).not.toContain('timeout');
  });

  it('运行时变量默认 fallback 不传覆盖值，但无 default 的 text 空字符串可显式覆盖', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        variables: [
          { name: 'service_source', type: 'text', default: 'api' },
          { name: 'empty_keyword', type: 'text' },
          { name: 'row_limit', type: 'number', default: 10 },
          { name: 'log_level', type: 'select', options: ['error', 'warn'], default: 'error' }
        ],
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');
    const runtimeVariables = within(preview).getByLabelText('运行时变量值');

    await user.type(within(runtimeVariables).getByLabelText('运行时变量 empty_keyword'), 'draft');
    await user.clear(within(runtimeVariables).getByLabelText('运行时变量 empty_keyword'));
    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    await waitFor(() => expect(apiMocks.previewDashboardPanel).toHaveBeenCalledWith(12, 7, 'logs', { empty_keyword: '' }));
  });

  it('为 metrics panel 渲染轻量聚合可视化', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [
          { id: 'latency', title: '接口延迟', type: 'metrics', query: { name: 'http.duration' }, layout: { x: 0, y: 0, w: 6, h: 3 } }
        ]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'latency',
      title: '接口延迟',
      panel_type: 'metrics',
      query: { name: 'http.duration' },
      preview: {
        kind: 'metrics',
        mode: 'aggregate',
        items: [
          {
            project_id: project.id,
            name: 'http.duration',
            source: 'api',
            window_start: '2026-06-20T10:00:00Z',
            window_end: '2026-06-20T10:05:00Z',
            aggregation: 'avg',
            value: 18,
            sample_count: 2,
            unit: 'ms'
          },
          {
            project_id: project.id,
            name: 'http.duration',
            source: 'worker',
            window_start: '2026-06-20T10:05:00Z',
            window_end: '2026-06-20T10:10:00Z',
            aggregation: 'avg',
            value: 22,
            sample_count: 3,
            unit: 'ms'
          }
        ]
      }
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    expect(await within(preview).findByText('指标聚合')).toBeTruthy();
    const visual = within(preview).getByLabelText('指标聚合可视化');
    expect(within(visual).getByRole('img', { name: '指标聚合柱状预览' })).toBeTruthy();
    expect(within(visual).getByText('avg 22 ms')).toBeTruthy();
    expect(within(visual).getByText('样本 5')).toBeTruthy();
    expect(within(preview).getByText('http.duration / worker')).toBeTruthy();
  });

  it('为 topology panel 渲染节点边可视摘要', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'topology', title: '服务拓扑', type: 'topology', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'topology',
      title: '服务拓扑',
      panel_type: 'topology',
      query: {},
      preview: {
        kind: 'topology',
        mode: 'topology',
        nodes: [
          {
            source: 'api',
            span_count: 8,
            trace_count: 4,
            error_span_count: 1,
            avg_duration_ms: 70,
            max_duration_ms: 120
          },
          {
            source: 'worker',
            span_count: 5,
            trace_count: 3,
            error_span_count: 0,
            avg_duration_ms: 55,
            max_duration_ms: 90
          }
        ],
        edges: [
          {
            from_source: 'api',
            to_source: 'worker',
            call_count: 6,
            error_count: 1,
            avg_duration_ms: 50,
            max_duration_ms: 80
          }
        ]
      }
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    expect(await within(preview).findByText('Topology 摘要')).toBeTruthy();
    const visual = within(preview).getByLabelText('Topology 可视化');
    expect(within(visual).getByRole('img', { name: 'Topology 节点边预览' })).toBeTruthy();
    expect(within(visual).getByText('2 个节点')).toBeTruthy();
    expect(within(visual).getByText('1 条边')).toBeTruthy();
    expect(within(preview).getByText('api -> worker')).toBeTruthy();
  });

  it('空查询预览保留 empty 状态且不渲染图表', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: { level: 'error' }, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockResolvedValue({
      project_id: project.id,
      dashboard_id: panelDashboard.id,
      panel_id: 'logs',
      title: '错误日志',
      panel_type: 'logs',
      query: { level: 'error' },
      preview: {
        kind: 'logs',
        mode: 'recent',
        items: []
      }
    });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    expect(await within(preview).findByText('没有匹配的日志样例。')).toBeTruthy();
    expect(within(preview).queryByRole('img')).toBeNull();
  });

  it('未保存 config 草稿不会触发后端 panel 查询预览', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: {
        value: JSON.stringify(
          {
            refresh_seconds: 30,
            panels: [
              { id: 'logs', title: '错误日志', type: 'logs', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } },
              { id: 'draft', title: '草稿 panel', type: 'events', query: {}, layout: { x: 6, y: 0, w: 6, h: 3 } }
            ]
          },
          null,
          2
        )
      }
    });

    await user.click(within(preview).getAllByRole('button', { name: '加载预览' })[0]);

    expect(await within(preview).findByText('保存后可查询')).toBeTruthy();
    expect(apiMocks.previewDashboardPanel).not.toHaveBeenCalled();
  });

  it('panel 查询预览 422 错误显示在对应 panel 内', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [{ id: 'logs', title: '错误日志', type: 'logs', query: { limit: 101 }, layout: { x: 0, y: 0, w: 6, h: 3 } }]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    apiMocks.previewDashboardPanel.mockRejectedValue(
      new ApiClientError({
        message: 'panel.query.limit 必须在 1..100 之间',
        status: 422,
        details: { detail: 'panel.query.limit 必须在 1..100 之间' }
      })
    );
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();
    const preview = within(editPanel as HTMLElement).getByLabelText('Panel 预览');

    await user.click(within(preview).getByRole('button', { name: '加载预览' }));

    expect(await within(preview).findByText('查询预览失败')).toBeTruthy();
    expect(within(preview).getByText(/panel\.query\.limit 必须在 1\.\.100 之间/)).toBeTruthy();
    expect(within(preview).queryByLabelText('查询预览结果')).toBeNull();
    expect(within(preview).queryByRole('img')).toBeNull();
  });

  it('手动重排 config.panels 后更新旧草稿不会覆盖错误 panel', async () => {
    const user = userEvent.setup();
    const panelDashboard = createDashboardFixture({
      config: {
        refresh_seconds: 30,
        panels: [
          { id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } },
          { id: 'logs', title: '日志', type: 'logs', query: {}, layout: { x: 0, y: 3, w: 6, h: 3 } }
        ]
      }
    });
    apiMocks.listDashboards.mockResolvedValue({ items: [panelDashboard], limit: 50, offset: 0, total: 1 });
    renderPage(<DashboardsPage />);

    await user.click(await screen.findByRole('button', { name: /SLO 值班看板/ }));
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: /logs \/ logs/ }));
    await user.clear(within(editPanel as HTMLElement).getByLabelText('标题'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('标题'), '错误日志');
    const reorderedConfigText = JSON.stringify(
      {
        refresh_seconds: 30,
        panels: [
          { id: 'logs', title: '日志', type: 'logs', query: {}, layout: { x: 0, y: 3, w: 6, h: 3 } },
          { id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }
        ]
      },
      null,
      2
    );
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: reorderedConfigText }
    });

    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '更新 panel' }));

    expect(await screen.findByText('当前 config.panels 已变化，请重新选择要更新的 panel。')).toBeTruthy();
    expect((within(editPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value).toBe(
      reorderedConfigText
    );
    expect(JSON.parse(reorderedConfigText)).toEqual({
      refresh_seconds: 30,
      panels: [
        { id: 'logs', title: '日志', type: 'logs', query: {}, layout: { x: 0, y: 3, w: 6, h: 3 } },
        { id: 'cpu', title: 'CPU', type: 'metrics', query: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }
      ]
    });
    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('未点击列表项时不会自动提交首个 dashboard', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const editPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(editPanel).not.toBeNull();

    expect(within(editPanel as HTMLElement).queryByDisplayValue('SLO 值班看板')).toBeNull();
    const saveButton = within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    await user.click(saveButton);

    expect(apiMocks.updateDashboard).not.toHaveBeenCalled();
  });

  it('登出、session 切换和项目范围切换会清理本地编辑内容', async () => {
    const user = userEvent.setup();
    const { rerenderWithAuth } = renderPage(<DashboardsPage />, createSignedInAuth({ sessionRevision: 1 }));

    await screen.findAllByText('SLO 值班看板');
    await user.click(screen.getByRole('button', { name: /SLO 值班看板/ }));
    const firstEditPanel = screen.getAllByRole('heading', { name: '编辑' }).at(-1)?.closest('article') ?? null;
    expect(firstEditPanel).not.toBeNull();
    await user.clear(within(firstEditPanel as HTMLElement).getByLabelText('名称'));
    await user.type(within(firstEditPanel as HTMLElement).getByLabelText('名称'), '本地未保存名称');

    rerenderWithAuth(createSignedOutAuth(2));

    expect(await screen.findAllByText('等待登录')).not.toHaveLength(0);
    expect(screen.queryByDisplayValue('本地未保存名称')).toBeNull();
    expect(screen.queryByDisplayValue('SLO 值班看板')).toBeNull();

    apiMocks.listDashboards.mockResolvedValueOnce({ items: [], limit: 50, offset: 0, total: 0 });
    rerenderWithAuth(createSignedInAuth({ sessionRevision: 3 }));

    await screen.findByText('暂无仪表盘');
    expect(screen.queryByDisplayValue('本地未保存名称')).toBeNull();

    fireEvent.change(screen.getAllByLabelText('项目 ID')[0], { target: { value: '0' } });
    expect(await screen.findByText('项目 ID 无效')).toBeTruthy();
    expect(screen.queryByDisplayValue('SLO 值班看板')).toBeNull();
  });

  it('切换项目范围时不会把当前创建草稿带到新项目', async () => {
    apiMocks.listProjects.mockResolvedValue([project, otherProject]);
    apiMocks.listDashboards.mockImplementation(async (params?: DashboardListParams) =>
      params?.project_id === otherProject.id
        ? { items: [], limit: 50, offset: 0, total: 0 }
        : { items: [dashboard], limit: 50, offset: 0, total: 1 }
    );
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();

    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('项目 ID'), { target: { value: '12' } });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('名称'), { target: { value: '跨项目草稿' } });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('描述'), { target: { value: '不能带到支付平台' } });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: '{"version":99}' }
    });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('config JSON'), {
      target: { value: '{"refresh_seconds":5}' }
    });

    fireEvent.change(screen.getByRole('combobox', { name: '项目' }), { target: { value: `${otherProject.id}` } });

    await screen.findByText('暂无仪表盘');
    expect((within(createPanel as HTMLElement).getByLabelText('项目 ID') as HTMLInputElement).value).toBe('34');
    expect((within(createPanel as HTMLElement).getByLabelText('名称') as HTMLInputElement).value).toBe('');
    expect((within(createPanel as HTMLElement).getByLabelText('描述') as HTMLTextAreaElement).value).toBe('');
    expect((within(createPanel as HTMLElement).getByLabelText('layout JSON') as HTMLTextAreaElement).value).toBe(
      '{\n  "version": 1,\n  "widgets": []\n}'
    );
    expect((within(createPanel as HTMLElement).getByLabelText('config JSON') as HTMLTextAreaElement).value).toBe(
      '{\n  "refresh_seconds": 30\n}'
    );
  });

  it('支持下一页和上一页访问超过 50 条后的 dashboard', async () => {
    const user = userEvent.setup();
    const laterDashboard = createDashboardFixture({
      id: 61,
      name: '第 51 个看板',
      description: '第二页记录',
      layout: { version: 2, widgets: [{ i: 'latency' }] },
      config: { refresh_seconds: 15 }
    });
    apiMocks.listDashboards.mockImplementation(async (params?: DashboardListParams) =>
      params?.offset === 50
        ? { items: [laterDashboard], limit: 50, offset: 50, total: 51 }
        : { items: [dashboard], limit: 50, offset: 0, total: 51 }
    );

    renderPage(<DashboardsPage />);

    expect(await screen.findAllByText('第 1-1 条，共 51 条，每页 50 条。')).toHaveLength(2);
    const nextButton = screen.getByRole('button', { name: '下一页' });
    expect(nextButton.hasAttribute('disabled')).toBe(false);

    await user.click(nextButton);

    expect(await screen.findByText('第 51 个看板')).toBeTruthy();
    expect(apiMocks.listDashboards).toHaveBeenLastCalledWith({ project_id: undefined, limit: 50, offset: 50 });
    expect(screen.getAllByText('第 51-51 条，共 51 条，每页 50 条。')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '上一页' }));

    expect(await screen.findByText('SLO 值班看板')).toBeTruthy();
  });

  it('删除末页唯一记录后会回退到上一页', async () => {
    const user = userEvent.setup();
    const laterDashboard = createDashboardFixture({
      id: 61,
      name: '第 51 个看板',
      description: '第二页记录',
      layout: { version: 2, widgets: [{ i: 'latency' }] },
      config: { refresh_seconds: 15 }
    });
    let deleted = false;
    apiMocks.deleteDashboard.mockImplementation(async () => {
      deleted = true;
      return null;
    });
    apiMocks.listDashboards.mockImplementation(async (params?: DashboardListParams) => {
      if (params?.offset === 50) {
        return { items: [laterDashboard], limit: 50, offset: 50, total: 51 };
      }

      return { items: [dashboard], limit: 50, offset: 0, total: deleted ? 50 : 51 };
    });

    renderPage(<DashboardsPage />);

    await screen.findAllByText('第 1-1 条，共 51 条，每页 50 条。');
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('第 51 个看板')).toBeTruthy();
    expect(apiMocks.listDashboards).toHaveBeenLastCalledWith({ project_id: undefined, limit: 50, offset: 50 });

    await user.click(screen.getByTitle('删除仪表盘'));

    await waitFor(() => expect(apiMocks.deleteDashboard).toHaveBeenCalledWith(12, 61));
    await waitFor(() =>
      expect(apiMocks.listDashboards).toHaveBeenLastCalledWith({ project_id: undefined, limit: 50, offset: 0 })
    );
    expect(await screen.findByText('SLO 值班看板')).toBeTruthy();
    expect(screen.getAllByText('第 1-1 条，共 50 条，每页 50 条。')).toHaveLength(2);
  });

  it('删除末页多条记录时 pending 会禁用所有删除入口避免快速连删', async () => {
    const user = userEvent.setup();
    const laterDashboard = createDashboardFixture({
      id: 61,
      name: '第 51 个看板',
      description: '第二页记录',
      layout: { version: 2, widgets: [{ i: 'latency' }] },
      config: { refresh_seconds: 15 }
    });
    const lastDashboard = createDashboardFixture({
      id: 62,
      name: '第 52 个看板',
      description: '第二页末尾记录',
      layout: { version: 2, widgets: [{ i: 'errors' }] },
      config: { refresh_seconds: 20 }
    });
    const pendingDelete = createDeferredNull();
    apiMocks.deleteDashboard.mockReturnValue(pendingDelete.promise);
    apiMocks.listDashboards.mockImplementation(async (params?: DashboardListParams) =>
      params?.offset === 50
        ? { items: [laterDashboard, lastDashboard], limit: 50, offset: 50, total: 52 }
        : { items: [dashboard], limit: 50, offset: 0, total: 52 }
    );

    renderPage(<DashboardsPage />);

    await screen.findAllByText('第 1-1 条，共 52 条，每页 50 条。');
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('第 51 个看板')).toBeTruthy();
    expect(await screen.findByText('第 52 个看板')).toBeTruthy();

    const deleteButtons = screen.getAllByTitle('删除仪表盘');
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => expect(apiMocks.deleteDashboard).toHaveBeenCalledWith(12, 61));
    await waitFor(() => {
      expect(deleteButtons[0].hasAttribute('disabled')).toBe(true);
      expect(deleteButtons[1].hasAttribute('disabled')).toBe(true);
    });

    expect(apiMocks.deleteDashboard).toHaveBeenCalledTimes(1);
    pendingDelete.resolve();
    await waitFor(() => expect(deleteButtons[0].hasAttribute('disabled')).toBe(false));
  });

  it('删除请求成功但列表刷新未完成前仍禁用旧列表删除入口', async () => {
    const user = userEvent.setup();
    const laterDashboard = createDashboardFixture({
      id: 61,
      name: '第 51 个看板',
      description: '第二页记录',
      layout: { version: 2, widgets: [{ i: 'latency' }] },
      config: { refresh_seconds: 15 }
    });
    const lastDashboard = createDashboardFixture({
      id: 62,
      name: '第 52 个看板',
      description: '第二页末尾记录',
      layout: { version: 2, widgets: [{ i: 'errors' }] },
      config: { refresh_seconds: 20 }
    });
    const pendingRefresh = createDeferred<DashboardListResult>();
    let deleted = false;
    let refreshAfterDeleteRequested = false;
    apiMocks.deleteDashboard.mockImplementation(async () => {
      deleted = true;
      return null;
    });
    apiMocks.listDashboards.mockImplementation(async (params?: DashboardListParams) => {
      if (params?.offset === 50 && deleted) {
        refreshAfterDeleteRequested = true;
        return pendingRefresh.promise;
      }

      return params?.offset === 50
        ? { items: [laterDashboard, lastDashboard], limit: 50, offset: 50, total: 52 }
        : { items: [dashboard], limit: 50, offset: 0, total: 52 };
    });

    renderPage(<DashboardsPage />);

    await screen.findAllByText('第 1-1 条，共 52 条，每页 50 条。');
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('第 51 个看板')).toBeTruthy();
    expect(await screen.findByText('第 52 个看板')).toBeTruthy();

    const deleteButtons = screen.getAllByTitle('删除仪表盘');
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(apiMocks.deleteDashboard).toHaveBeenCalledWith(12, 61));
    await waitFor(() => expect(refreshAfterDeleteRequested).toBe(true));
    await waitFor(() => {
      expect(deleteButtons[0].hasAttribute('disabled')).toBe(true);
      expect(deleteButtons[1].hasAttribute('disabled')).toBe(true);
    });

    fireEvent.click(deleteButtons[1]);

    expect(apiMocks.deleteDashboard).toHaveBeenCalledTimes(1);
    pendingRefresh.resolve({ items: [lastDashboard], limit: 50, offset: 50, total: 51 });
    await waitFor(() => expect(screen.queryByText('第 51 个看板')).toBeNull());
    expect(screen.getByText('第 52 个看板')).toBeTruthy();
    expect(screen.getByTitle('删除仪表盘').hasAttribute('disabled')).toBe(false);
  });

  it('JSON 输入不是对象或数组时显示本地校验错误且不请求创建接口', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();
    expect(within(createPanel as HTMLElement).getByLabelText('layout JSON').getAttribute('maxLength')).toBe(
      `${DASHBOARD_JSON_MAX_BYTES}`
    );

    await user.clear(within(createPanel as HTMLElement).getByLabelText('项目 ID'));
    await user.type(within(createPanel as HTMLElement).getByLabelText('项目 ID'), '12');
    await user.type(within(createPanel as HTMLElement).getByLabelText('名称'), '坏 JSON 看板');
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: '"text"' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(await screen.findByText('layout 必须是 JSON 对象或数组。')).toBeTruthy();
    expect(apiMocks.createDashboard).not.toHaveBeenCalled();
  });

  it('超大、过深、NaN 和 Infinity JSON 会被本地校验拦截', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();

    await user.clear(within(createPanel as HTMLElement).getByLabelText('项目 ID'));
    await user.type(within(createPanel as HTMLElement).getByLabelText('项目 ID'), '12');
    await user.type(within(createPanel as HTMLElement).getByLabelText('名称'), '坏 JSON 看板');
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: JSON.stringify({ blob: 'x'.repeat(DASHBOARD_JSON_MAX_BYTES) }) }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(await screen.findByText(`layout 不能超过 ${DASHBOARD_JSON_MAX_BYTES} 字节。`)).toBeTruthy();
    expect(apiMocks.createDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: `${'['.repeat(DASHBOARD_JSON_MAX_DEPTH)}0${']'.repeat(DASHBOARD_JSON_MAX_DEPTH)}` }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(await screen.findByText(`layout 嵌套深度不能超过 ${DASHBOARD_JSON_MAX_DEPTH}。`)).toBeTruthy();
    expect(apiMocks.createDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: '{"value":NaN}' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(await screen.findByText('layout 不能包含 NaN 或 Infinity。')).toBeTruthy();
    expect(apiMocks.createDashboard).not.toHaveBeenCalled();

    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('layout JSON'), {
      target: { value: '{"value":Infinity}' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建仪表盘' }));

    expect(await screen.findByText('layout 不能包含 NaN 或 Infinity。')).toBeTruthy();
    expect(apiMocks.createDashboard).not.toHaveBeenCalled();
  });
});

function createDeferred<TValue>() {
  let resolvePromise: (value: TValue) => void = () => {
    throw new Error('deferred promise resolver was not registered');
  };
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

function createDeferredNull() {
  const deferred = createDeferred<null>();

  return { promise: deferred.promise, resolve: () => deferred.resolve(null) };
}
