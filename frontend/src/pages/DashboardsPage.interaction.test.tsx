// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../api/dashboards';
import type { Project } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { DashboardsPage } from './DashboardsPage';

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn<() => Promise<Project[]>>(),
  listDashboards: vi.fn<() => Promise<{ items: Dashboard[]; limit: number; offset: number; total: number }>>(),
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
  updateDashboard: apiMocks.updateDashboard
}));

const project: Project = {
  id: 12,
  name: '核心平台',
  key: 'core-platform',
  description: '主项目'
};

const dashboard: Dashboard = {
  id: 7,
  project_id: project.id,
  name: 'SLO 值班看板',
  description: '核心服务面板',
  layout: { version: 1, widgets: [] },
  config: { refresh_seconds: 30 },
  created_by_user_id: 1,
  updated_by_user_id: 1,
  created_at: '2026-06-23T10:20:00Z',
  updated_at: '2026-06-23T10:30:00Z'
};

function createSignedInAuth(): AuthContextValue {
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
    refreshCurrentUser: vi.fn(async () => null)
  };
}

function renderPage(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createSignedInAuth()}>
        <MemoryRouter initialEntries={['/dashboards']}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.listProjects.mockResolvedValue([project]);
  apiMocks.listDashboards.mockResolvedValue({ items: [dashboard], limit: 50, offset: 0, total: 1 });
  apiMocks.createDashboard.mockResolvedValue({ ...dashboard, id: 8, name: '新建看板' });
  apiMocks.updateDashboard.mockResolvedValue({ ...dashboard, name: '服务健康概览', description: null });
  apiMocks.deleteDashboard.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
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

  it('JSON 输入不是对象或数组时显示本地校验错误且不请求创建接口', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardsPage />);

    await screen.findAllByText('SLO 值班看板');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();

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
});
