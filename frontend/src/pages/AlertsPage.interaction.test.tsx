// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertRule, AlertRuleListParams, CreateAlertRuleRequest, UpdateAlertRuleRequest } from '../api/alerts';
import { ApiClientError } from '../api/http';
import type { Project } from '../api/settings';
import { AuthContext } from '../features/auth/authContext';
import type { AuthContextValue } from '../features/auth/authContext';
import { AlertsPage } from './AlertsPage';

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn<() => Promise<Project[]>>(),
  listAlertRules: vi.fn<(params?: AlertRuleListParams) => Promise<{ items: AlertRule[]; limit: number; offset: number; total: number }>>(),
  createAlertRule: vi.fn<(payload: CreateAlertRuleRequest) => Promise<AlertRule>>(),
  updateAlertRule: vi.fn<(projectId: number, ruleId: number, payload: UpdateAlertRuleRequest) => Promise<AlertRule>>(),
  deleteAlertRule: vi.fn<(projectId: number, ruleId: number) => Promise<null>>()
}));

vi.mock('../api/settings', () => ({
  listProjects: apiMocks.listProjects
}));

vi.mock('../api/alerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/alerts')>();
  return {
    ...actual,
    createAlertRule: apiMocks.createAlertRule,
    deleteAlertRule: apiMocks.deleteAlertRule,
    listAlertRules: apiMocks.listAlertRules,
    updateAlertRule: apiMocks.updateAlertRule
  };
});

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

const rule = createAlertRuleFixture();

function createAlertRuleFixture(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
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
    updated_at: '2026-06-26T12:05:00Z',
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
        <MemoryRouter initialEntries={['/alerts']}>{page}</MemoryRouter>
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
  apiMocks.listProjects.mockResolvedValue([project, otherProject]);
  apiMocks.listAlertRules.mockResolvedValue({ items: [rule], limit: 50, offset: 0, total: 1 });
  apiMocks.createAlertRule.mockResolvedValue(createAlertRuleFixture({ id: 8, name: '新建错误率规则' }));
  apiMocks.updateAlertRule.mockImplementation(async (_projectId, _ruleId, payload) => ({
    ...rule,
    ...payload,
    updated_at: '2026-06-26T12:10:00Z'
  }));
  apiMocks.deleteAlertRule.mockResolvedValue(null);
  vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AlertsPage interactions', () => {
  it('按 severity/signal/enabled 和项目筛选列表', async () => {
    renderPage(<AlertsPage />);

    await screen.findByText('HTTP 5xx rate');
    fireEvent.change(screen.getByRole('combobox', { name: '项目' }), { target: { value: '34' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'severity 筛选' }), { target: { value: 'critical' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'signal 筛选' }), { target: { value: 'metrics' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'enabled 筛选' }), { target: { value: 'true' } });

    await waitFor(() =>
      expect(apiMocks.listAlertRules).toHaveBeenLastCalledWith({
        project_id: 34,
        severity: 'critical',
        signal: 'metrics',
        enabled: true,
        limit: 50,
        offset: 0
      })
    );
  });

  it('创建规则会提交解析后的 JSON 和 evaluation', async () => {
    const user = userEvent.setup();
    renderPage(<AlertsPage />);

    await screen.findByText('HTTP 5xx rate');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();

    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则项目'), { target: { value: '12' } });
    await user.type(within(createPanel as HTMLElement).getByLabelText('创建规则名称'), '新建错误率规则');
    await user.type(within(createPanel as HTMLElement).getByLabelText('创建规则描述'), '错误率过高');
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则severity'), { target: { value: 'critical' } });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则signal'), { target: { value: 'logs' } });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则condition JSON'), {
      target: { value: '{"field":"level","operator":"eq","value":"error"}' }
    });
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则evaluation JSON'), {
      target: { value: '{"window_seconds":600,"interval_seconds":120}' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建规则' }));

    expect(apiMocks.createAlertRule.mock.calls[0]?.[0]).toEqual({
      project_id: 12,
      name: '新建错误率规则',
      description: '错误率过高',
      enabled: true,
      severity: 'critical',
      signal: 'logs',
      condition: { field: 'level', operator: 'eq', value: 'error' },
      evaluation: { window_seconds: 600, interval_seconds: 120 }
    });
  });

  it('本地 evaluation 校验错误会阻止创建请求', async () => {
    const user = userEvent.setup();
    renderPage(<AlertsPage />);

    await screen.findByText('HTTP 5xx rate');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则项目'), { target: { value: '12' } });
    await user.type(within(createPanel as HTMLElement).getByLabelText('创建规则名称'), '坏窗口规则');
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则evaluation JSON'), {
      target: { value: '{"window_seconds":0,"interval_seconds":60}' }
    });
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建规则' }));

    expect(await screen.findByText('evaluation.window_seconds 必须是 1..86400 的整数。')).toBeTruthy();
    expect(apiMocks.createAlertRule).not.toHaveBeenCalled();
  });

  it('选择规则后编辑只提交变化字段并展示用户和时间', async () => {
    const user = userEvent.setup();
    renderPage(<AlertsPage />);

    await user.click(await screen.findByRole('button', { name: /HTTP 5xx rate/ }));
    const editPanel = screen.getByRole('heading', { name: '编辑' }).closest('article');
    expect(editPanel).not.toBeNull();
    expect(within(editPanel as HTMLElement).getByText('created_by')).toBeTruthy();
    expect(within(editPanel as HTMLElement).getByText('updated_by')).toBeTruthy();

    await user.clear(within(editPanel as HTMLElement).getByLabelText('保存修改名称'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('保存修改名称'), 'HTTP 5xx burn rate');
    await user.clear(within(editPanel as HTMLElement).getByLabelText('保存修改描述'));
    fireEvent.change(within(editPanel as HTMLElement).getByLabelText('保存修改evaluation JSON'), {
      target: { value: '{"window_seconds":600,"interval_seconds":120}' }
    });
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));

    expect(apiMocks.updateAlertRule).toHaveBeenCalledWith(12, 7, {
      name: 'HTTP 5xx burn rate',
      description: null,
      evaluation: { window_seconds: 600, interval_seconds: 120 }
    });
  });

  it('启停只 PATCH enabled，删除前会确认', async () => {
    const user = userEvent.setup();
    renderPage(<AlertsPage />);

    await screen.findByText('HTTP 5xx rate');
    await user.click(screen.getByTitle('停用规则'));

    await waitFor(() => expect(apiMocks.updateAlertRule).toHaveBeenCalledWith(12, 7, { enabled: false }));

    await user.click(screen.getByTitle('删除规则'));

    expect(globalThis.confirm).toHaveBeenCalledWith('删除告警规则「HTTP 5xx rate」？');
    expect(apiMocks.deleteAlertRule).toHaveBeenCalledWith(12, 7);
  });

  it('创建冲突和编辑 422 错误显示表单级信息', async () => {
    const user = userEvent.setup();
    apiMocks.createAlertRule.mockRejectedValue(
      new ApiClientError({
        message: 'duplicate',
        status: 409,
        details: { detail: '同项目 name 重复' }
      })
    );
    apiMocks.updateAlertRule.mockRejectedValue(
      new ApiClientError({
        message: 'invalid',
        status: 422,
        details: { detail: 'evaluation.window_seconds 必须是整数' }
      })
    );
    renderPage(<AlertsPage />);

    await screen.findByText('HTTP 5xx rate');
    const createPanel = screen.getByRole('heading', { name: '创建' }).closest('article');
    expect(createPanel).not.toBeNull();
    fireEvent.change(within(createPanel as HTMLElement).getByLabelText('创建规则项目'), { target: { value: '12' } });
    await user.type(within(createPanel as HTMLElement).getByLabelText('创建规则名称'), 'HTTP 5xx rate');
    await user.click(within(createPanel as HTMLElement).getByRole('button', { name: '创建规则' }));
    expect(await screen.findByText(/同项目 name 重复/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /HTTP 5xx rate/ }));
    const editPanel = screen.getByRole('heading', { name: '编辑' }).closest('article');
    expect(editPanel).not.toBeNull();
    await user.clear(within(editPanel as HTMLElement).getByLabelText('保存修改名称'));
    await user.type(within(editPanel as HTMLElement).getByLabelText('保存修改名称'), 'HTTP 5xx burn rate');
    await user.click(within(editPanel as HTMLElement).getByRole('button', { name: '保存修改' }));
    expect(await screen.findByText(/evaluation\.window_seconds 必须是整数/)).toBeTruthy();
  });
});
