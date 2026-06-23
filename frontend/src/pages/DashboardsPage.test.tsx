import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../api/http';
import type { Dashboard, DashboardListResponse } from '../api/dashboards';
import type { Project } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { buildDashboardPatchPayload, buildDashboardPayload } from '../features/dashboards/dashboardPayload';
import { dashboardQueryKeys } from '../features/dashboards/queryKeys';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { DashboardsPage } from './DashboardsPage';

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

function createAuth(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isRestoring: false,
    canRequestAuthenticatedApi: false,
    sessionRevision: 1,
    sessionErrorMessage: null,
    login: vi.fn(async () => null),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(async () => null),
    ...overrides
  };
}

function createSignedOutAuth(sessionRevision = 1) {
  return createAuth({ sessionRevision });
}

function createRestoringAuth(sessionRevision = 1) {
  return createAuth({
    isAuthenticated: true,
    isRestoring: true,
    canRequestAuthenticatedApi: false,
    sessionRevision
  });
}

function createSignedInAuth(sessionRevision = 2) {
  return createAuth({
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
    sessionRevision
  });
}

function renderWithProviders(element: ReactElement, queryClient: QueryClient, auth: AuthContextValue, initialEntry = '/dashboards') {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function seedProjects(queryClient: QueryClient, sessionRevision: number, projects: Project[] = [project]) {
  queryClient.setQueryData(settingsQueryKeys.projectList(sessionRevision), projects);
}

function dashboardResponse(items: Dashboard[] = [dashboard]): DashboardListResponse {
  return {
    items,
    limit: 50,
    offset: 0,
    total: items.length
  };
}

function seedDashboards(
  queryClient: QueryClient,
  sessionRevision: number,
  response = dashboardResponse(),
  params: { project_id?: number; limit: number; offset: number } = { project_id: undefined, limit: 50, offset: 0 }
) {
  queryClient.setQueryData(dashboardQueryKeys.list(sessionRevision, params), response);
}

function seedDashboardError(queryClient: QueryClient, sessionRevision: number, error: Error) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: dashboardQueryKeys.list(sessionRevision, { project_id: undefined, limit: 50, offset: 0 })
    },
    {
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: 0,
      error,
      errorUpdateCount: 1,
      errorUpdatedAt: 1,
      fetchFailureCount: 1,
      fetchFailureReason: error,
      fetchMeta: null,
      isInvalidated: false,
      status: 'error',
      fetchStatus: 'idle'
    }
  );
}

function seedDashboardLoading(queryClient: QueryClient, sessionRevision: number) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: dashboardQueryKeys.list(sessionRevision, { project_id: undefined, limit: 50, offset: 0 })
    },
    {
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: 0,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: 'pending',
      fetchStatus: 'fetching'
    }
  );
}

describe('DashboardsPage states', () => {
  it('未登录时显示登录提示并隐藏旧 dashboard 缓存', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 1);
    seedDashboards(queryClient, 1);

    const html = renderWithProviders(<DashboardsPage />, queryClient, createSignedOutAuth(1));

    expect(html).toContain('登录后管理仪表盘');
    expect(html).toContain('Dashboard 接口需要当前账号的访问令牌。');
    expect(html).toContain('等待登录');
    expect(html).not.toContain(dashboard.name);
  });

  it('恢复登录状态时隐藏同 revision 的 dashboard 缓存', () => {
    const queryClient = new QueryClient();
    seedDashboards(queryClient, 1);

    const html = renderWithProviders(<DashboardsPage />, queryClient, createRestoringAuth(1));

    expect(html).toContain('正在确认登录状态');
    expect(html).not.toContain(dashboard.name);
  });

  it('切换账号后通过 sessionRevision 隔离旧 dashboard 缓存', () => {
    const queryClient = new QueryClient();
    seedDashboards(queryClient, 1);

    const html = renderWithProviders(<DashboardsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('正在加载仪表盘');
    expect(html).not.toContain(dashboard.name);
  });

  it('已登录但无项目时展示无项目和空列表状态', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 2, []);
    seedDashboards(queryClient, 2, dashboardResponse([]));

    const html = renderWithProviders(<DashboardsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('项目');
    expect(html).toContain('<strong>0</strong>');
    expect(html).toContain('暂无仪表盘');
    expect(html).toContain('全部可访问项目');
  });

  it('展示已缓存列表、项目选择和编辑表单', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 2);
    seedDashboards(queryClient, 2);

    const html = renderWithProviders(<DashboardsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('仪表盘');
    expect(html).toContain('核心平台');
    expect(html).toContain('#<!-- -->12');
    expect(html).toContain('SLO 值班看板');
    expect(html).toContain('核心服务面板');
    expect(html).toContain('创建仪表盘');
    expect(html).toContain('保存修改');
    expect(html).not.toContain('Trace ID');
    expect(html).not.toContain('Span ID');
  });

  it('总数超过当前页时显示分页范围', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 2);
    seedDashboards(queryClient, 2, { items: [dashboard], limit: 50, offset: 0, total: 51 });

    const html = renderWithProviders(<DashboardsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('第 1-1 条，共 51 条，每页 50 条。');
  });

  it('列表加载中和读取错误状态可见', () => {
    const loadingClient = new QueryClient();
    const errorClient = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    seedDashboardLoading(loadingClient, 2);
    seedDashboardError(
      errorClient,
      2,
      new ApiClientError({
        message: 'missing',
        status: 404,
        details: { detail: '项目不存在' }
      })
    );

    const loadingHtml = renderWithProviders(<DashboardsPage />, loadingClient, createSignedInAuth(2));
    const errorHtml = renderWithProviders(<DashboardsPage />, errorClient, createSignedInAuth(2));

    expect(loadingHtml).toContain('正在加载仪表盘');
    expect(errorHtml).toContain('仪表盘读取失败');
    expect(errorHtml).toContain('项目不存在');
  });
});

describe('Dashboard page helpers', () => {
  it('创建 payload 解析 JSON 并把空描述转成 null', () => {
    expect(
      buildDashboardPayload({
        projectId: 12,
        name: '服务总览',
        description: ' ',
        layoutText: '{"version":1}',
        configText: '[]'
      })
    ).toEqual({
      ok: true,
      value: {
        project_id: 12,
        name: '服务总览',
        description: null,
        layout: { version: 1 },
        config: []
      }
    });
  });

  it('创建 payload 返回 JSON 校验错误', () => {
    expect(
      buildDashboardPayload({
        projectId: 12,
        name: '服务总览',
        description: '',
        layoutText: '"not-container"',
        configText: '{}'
      })
    ).toEqual({
      ok: false,
      message: 'layout 必须是 JSON 对象或数组。'
    });
  });

  it('编辑 payload 只提交变化字段并允许 description=null', () => {
    expect(
      buildDashboardPatchPayload(dashboard, {
        name: '服务健康概览',
        description: '',
        layoutText: JSON.stringify(dashboard.layout, null, 2),
        configText: JSON.stringify({ refresh_seconds: 60 }, null, 2)
      })
    ).toEqual({
      ok: true,
      value: {
        name: '服务健康概览',
        description: null,
        config: { refresh_seconds: 60 }
      }
    });
  });

  it('编辑 payload 无变化时提示至少修改一个字段', () => {
    expect(
      buildDashboardPatchPayload(dashboard, {
        name: dashboard.name,
        description: dashboard.description ?? '',
        layoutText: JSON.stringify(dashboard.layout, null, 2),
        configText: JSON.stringify(dashboard.config, null, 2)
      })
    ).toEqual({
      ok: false,
      message: '至少修改一个字段后再保存。'
    });
  });
});
