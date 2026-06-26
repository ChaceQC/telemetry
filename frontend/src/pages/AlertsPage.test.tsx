import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AlertRule, AlertRuleListResponse } from '../api/alerts';
import { ApiClientError } from '../api/http';
import type { Project } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { alertRuleQueryKeys } from '../features/alerts/queryKeys';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { AlertsPage } from './AlertsPage';

const project: Project = {
  id: 12,
  name: '核心平台',
  key: 'core-platform',
  description: '主项目'
};

const rule: AlertRule = {
  id: 7,
  project_id: project.id,
  name: 'HTTP 5xx rate',
  description: '5 分钟错误率过高',
  enabled: true,
  severity: 'critical',
  signal: 'metrics',
  condition: { metric: 'http.server.errors', operator: 'gt', threshold: 3 },
  evaluation: { window_seconds: 300, interval_seconds: 60 },
  created_by_user_id: 1,
  updated_by_user_id: 2,
  created_at: '2026-06-26T12:00:00Z',
  updated_at: '2026-06-26T12:05:00Z'
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

function renderWithProviders(element: ReactElement, queryClient: QueryClient, auth: AuthContextValue, initialEntry = '/alerts') {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function alertRuleResponse(items: AlertRule[] = [rule]): AlertRuleListResponse {
  return {
    items,
    limit: 50,
    offset: 0,
    total: items.length
  };
}

function seedProjects(queryClient: QueryClient, sessionRevision: number, projects: Project[] = [project]) {
  queryClient.setQueryData(settingsQueryKeys.projectList(sessionRevision), projects);
}

function seedRules(queryClient: QueryClient, sessionRevision: number, response = alertRuleResponse()) {
  queryClient.setQueryData(
    alertRuleQueryKeys.list(sessionRevision, { project_id: undefined, severity: undefined, signal: undefined, enabled: undefined, limit: 50, offset: 0 }),
    response
  );
}

function seedRulesError(queryClient: QueryClient, sessionRevision: number, error: Error) {
  queryClient.getQueryCache().build(
    queryClient,
    {
      queryKey: alertRuleQueryKeys.list(sessionRevision, {
        project_id: undefined,
        severity: undefined,
        signal: undefined,
        enabled: undefined,
        limit: 50,
        offset: 0
      })
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

describe('AlertsPage states', () => {
  it('未登录时显示登录提示并隐藏旧告警缓存', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 1);
    seedRules(queryClient, 1);

    const html = renderWithProviders(<AlertsPage />, queryClient, createSignedOutAuth(1));

    expect(html).toContain('请先登录');
    expect(html).toContain('登录后可以管理告警规则。');
    expect(html).not.toContain(rule.name);
  });

  it('恢复登录状态时隐藏同 revision 的告警缓存', () => {
    const queryClient = new QueryClient();
    seedRules(queryClient, 1);

    const html = renderWithProviders(<AlertsPage />, queryClient, createRestoringAuth(1));

    expect(html).toContain('正在确认登录状态');
    expect(html).not.toContain(rule.name);
  });

  it('切换账号后通过 sessionRevision 隔离旧告警缓存', () => {
    const queryClient = new QueryClient();
    seedRules(queryClient, 1);

    const html = renderWithProviders(<AlertsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('正在加载告警规则');
    expect(html).not.toContain(rule.name);
  });

  it('展示已缓存列表、筛选和编辑入口', () => {
    const queryClient = new QueryClient();
    seedProjects(queryClient, 2);
    seedRules(queryClient, 2);

    const html = renderWithProviders(<AlertsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('告警规则');
    expect(html).toContain('核心平台');
    expect(html).toContain('HTTP 5xx rate');
    expect(html).toContain('critical');
    expect(html).toContain('创建规则');
    expect(html).toContain('保存修改');
    expect(html).toContain('未选择规则');
  });

  it('列表读取错误覆盖 404/422 等页面错误展示', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    seedRulesError(
      queryClient,
      2,
      new ApiClientError({
        message: 'missing',
        status: 404,
        details: { detail: '告警规则不存在' }
      })
    );

    const html = renderWithProviders(<AlertsPage />, queryClient, createSignedInAuth(2));

    expect(html).toContain('告警规则读取失败');
    expect(html).toContain('告警规则不存在');
  });
});
