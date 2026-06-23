import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { IngestStatItem } from '../api/ingestStats';
import type { Environment, Project, Service } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { resolveLoginReturnPath } from '../features/auth/loginReturnPath';
import { ingestStatsQueryKeys } from '../features/overview/queryKeys';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { OverviewPage } from './OverviewPage';
import { SettingsPage } from './SettingsPage';

const staleProject: Project = {
  id: 7,
  name: 'Stale Billing Project',
  key: 'stale-billing',
  description: 'old account project'
};

const staleEnvironment: Environment = {
  id: 8,
  project_id: staleProject.id,
  project_name: staleProject.name,
  name: 'Stale Production Environment',
  key: 'stale-prod'
};

const staleService: Service = {
  id: 9,
  project_id: staleProject.id,
  project_name: staleProject.name,
  environment_id: staleEnvironment.id,
  environment_name: staleEnvironment.name,
  name: 'Stale API Service',
  key: 'stale-api'
};

const staleStats: IngestStatItem[] = [
  {
    bucket_start: '2026-06-22T08:00:00Z',
    project_id: staleProject.id,
    api_key_id: 3,
    kind: 'metric',
    source: 'stale-agent',
    accepted_count: 12_345,
    rejected_count: 6,
    bytes_count: 8192
  }
];

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
      username: 'current-operator',
      display_name: 'Current Operator',
      email: null,
      roles: []
    },
    isAuthenticated: true,
    isRestoring: false,
    canRequestAuthenticatedApi: true,
    sessionRevision
  });
}

function renderWithProviders(element: ReactElement, queryClient: QueryClient, auth: AuthContextValue, initialEntry = '/') {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function seedSettingsCache(queryClient: QueryClient, sessionRevision: number) {
  queryClient.setQueryData(settingsQueryKeys.projectList(sessionRevision), [staleProject]);
  queryClient.setQueryData(settingsQueryKeys.environmentList(sessionRevision), [staleEnvironment]);
  queryClient.setQueryData(settingsQueryKeys.serviceList(sessionRevision), [staleService]);
}

function seedOverviewCache(queryClient: QueryClient, sessionRevision: number) {
  queryClient.setQueryData(ingestStatsQueryKeys.overview(sessionRevision), staleStats);
}

describe('SettingsPage auth cache guards', () => {
  it('未登录时不展示 React Query 中上一 session 的基础管理缓存', () => {
    const queryClient = new QueryClient();
    seedSettingsCache(queryClient, 1);

    const html = renderWithProviders(<SettingsPage />, queryClient, createSignedOutAuth(1), '/settings');

    expect(html).toContain('请先登录');
    expect(html).toContain('0 条');
    expect(html).not.toContain(staleProject.name);
    expect(html).not.toContain(staleEnvironment.name);
    expect(html).not.toContain(staleService.name);
    expect(html).not.toContain('1 条');
  });

  it('恢复登录状态时隐藏同 revision 的旧 Settings 缓存', () => {
    const queryClient = new QueryClient();
    seedSettingsCache(queryClient, 1);

    const html = renderWithProviders(<SettingsPage />, queryClient, createRestoringAuth(1), '/settings');

    expect(html).toContain('正在确认登录状态');
    expect(html).not.toContain(staleProject.name);
    expect(html).not.toContain(staleEnvironment.name);
    expect(html).not.toContain(staleService.name);
  });

  it('切换账号后通过 sessionRevision 隔离旧 Settings 列表缓存', () => {
    const queryClient = new QueryClient();
    seedSettingsCache(queryClient, 1);

    const html = renderWithProviders(<SettingsPage />, queryClient, createSignedInAuth(2), '/settings');

    expect(html).not.toContain(staleProject.name);
    expect(html).not.toContain(staleEnvironment.name);
    expect(html).not.toContain(staleService.name);
  });

});

describe('OverviewPage auth cache guards', () => {
  it('未登录时不使用上一 session 的摄入统计缓存计算总览', () => {
    const queryClient = new QueryClient();
    seedOverviewCache(queryClient, 1);

    const html = renderWithProviders(<OverviewPage />, queryClient, createSignedOutAuth(1), '/');

    expect(html).toContain('已接收 0 条，拒绝 0 条');
    expect(html).toContain('登录后查看摄入统计');
    expect(html).not.toContain('1.2万');
    expect(html).not.toContain('stale-agent');
  });

  it('恢复登录状态时不使用同 revision 的旧摄入统计缓存', () => {
    const queryClient = new QueryClient();
    seedOverviewCache(queryClient, 1);

    const html = renderWithProviders(<OverviewPage />, queryClient, createRestoringAuth(1), '/');

    expect(html).toContain('正在恢复登录状态');
    expect(html).toContain('已接收 0 条，拒绝 0 条');
    expect(html).not.toContain('1.2万');
  });

  it('切换账号后通过 sessionRevision 隔离旧摄入统计缓存', () => {
    const queryClient = new QueryClient();
    seedOverviewCache(queryClient, 1);

    const html = renderWithProviders(<OverviewPage />, queryClient, createSignedInAuth(2), '/');

    expect(html).toContain('已接收 0 条，拒绝 0 条');
    expect(html).not.toContain('1.2万');
    expect(html).not.toContain('8192');
  });
});

describe('LoginPage return path', () => {
  it('登录后导航目标包含来源页面的 pathname 和 search', () => {
    expect(
      resolveLoginReturnPath({
        from: {
          pathname: '/logs',
          search: '?trace_id=trace-url&span_id=span-url'
        }
      })
    ).toBe('/logs?trace_id=trace-url&span_id=span-url');
  });

  it('缺少来源页面时回到首页', () => {
    expect(resolveLoginReturnPath(null)).toBe('/');
  });
});
