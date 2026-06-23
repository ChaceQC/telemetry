import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  FileJson,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  Pencil,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  updateDashboard,
  type Dashboard,
  type DashboardListParams
} from '../api/dashboards';
import { formatApiErrorMessage } from '../api/http';
import { listProjects, type Project } from '../api/settings';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import { createDefaultDashboardForm, dashboardToEditForm } from '../features/dashboards/dashboardJson';
import {
  buildDashboardPatchPayload,
  buildDashboardPayload,
  normalizePositiveInteger
} from '../features/dashboards/dashboardPayload';
import { dashboardQueryKeys, dashboardQueryRootKey } from '../features/dashboards/queryKeys';
import { findUnauthorizedApiError, resolveSettingsAuthState } from '../features/settings/authState';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { readErrorMessage } from '../features/settings/utils';

const DASHBOARD_PAGE_LIMIT = 50;
const emptyDashboards: Dashboard[] = [];
const emptyProjects: Project[] = [];

type CreateFormState = ReturnType<typeof createDefaultDashboardForm>;
type EditFormState = ReturnType<typeof dashboardToEditForm>;

export function DashboardsPage() {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [projectIdInput, setProjectIdInput] = useState('');
  const [formUnauthorizedError, setFormUnauthorizedError] = useState<unknown>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(() => createDefaultDashboardForm());
  const [editForm, setEditForm] = useState<EditFormState>(() => dashboardToEditForm(null));
  const [localCreateError, setLocalCreateError] = useState<string | null>(null);
  const [localEditError, setLocalEditError] = useState<string | null>(null);
  const shouldRequest = auth.canRequestAuthenticatedApi;

  const projectsQuery = useQuery({
    queryKey: settingsQueryKeys.projectList(auth.sessionRevision),
    queryFn: listProjects,
    enabled: shouldRequest,
    retry: false
  });

  const normalizedProjectId = normalizePositiveInteger(projectIdInput);
  const dashboardParams = useMemo<DashboardListParams>(
    () => ({
      project_id: normalizedProjectId ?? undefined,
      limit: DASHBOARD_PAGE_LIMIT,
      offset: 0
    }),
    [normalizedProjectId]
  );
  const dashboardsQuery = useQuery({
    queryKey: dashboardQueryKeys.list(auth.sessionRevision, dashboardParams),
    queryFn: () => listDashboards(dashboardParams),
    enabled: shouldRequest,
    retry: false
  });

  const unauthorizedError =
    findUnauthorizedApiError([projectsQuery.error, dashboardsQuery.error]) ?? formUnauthorizedError;
  const authState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: unauthorizedError
  });
  const canUseData = authState.shouldRequest;
  const projects = canUseData ? projectsQuery.data ?? emptyProjects : emptyProjects;
  const dashboards = canUseData ? dashboardsQuery.data?.items ?? emptyDashboards : emptyDashboards;
  const total = canUseData ? dashboardsQuery.data?.total ?? dashboards.length : 0;
  const selectedProject = normalizedProjectId
    ? projects.find((project) => project.id === normalizedProjectId) ?? null
    : null;
  const anyLoading = canUseData && (projectsQuery.isLoading || dashboardsQuery.isLoading);
  const anyError = canUseData && (projectsQuery.isError || dashboardsQuery.isError);

  const createMutation = useMutation({
    mutationFn: createDashboard,
    onSuccess: (dashboard) => {
      setCreateForm(createDefaultDashboardForm(`${dashboard.project_id}`));
      setProjectIdInput(`${dashboard.project_id}`);
      setEditForm(dashboardToEditForm(dashboard));
      invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedError(error);
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ dashboard, payload }: { dashboard: Dashboard; payload: Parameters<typeof updateDashboard>[2] }) =>
      updateDashboard(dashboard.project_id, dashboard.id, payload),
    onSuccess: (dashboard) => {
      setEditForm(dashboardToEditForm(dashboard));
      invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedError(error);
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboard: Dashboard) => deleteDashboard(dashboard.project_id, dashboard.id),
    onSuccess: (_result, dashboard) => {
      if (editForm.dashboardId === dashboard.id) {
        setEditForm(dashboardToEditForm(null));
      }
      invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedError(error);
      }
    }
  });

  const createFormError = isAuthError(createMutation.error) ? null : createMutation.error;
  const updateFormError = isAuthError(updateMutation.error) ? null : updateMutation.error;
  const deleteFormError = isAuthError(deleteMutation.error) ? null : deleteMutation.error;
  const selectedDashboard =
    (editForm.dashboardId ? dashboards.find((dashboard) => dashboard.id === editForm.dashboardId) : dashboards[0]) ?? null;
  const visibleEditForm =
    editForm.dashboardId || !selectedDashboard || editForm.name ? editForm : dashboardToEditForm(selectedDashboard);

  function handleProjectSelect(value: string) {
    setProjectIdInput(value);
    setCreateForm((current) => ({ ...current, projectId: normalizePositiveInteger(value) ? value : '' }));
  }

  function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authState.shouldRequest) {
      return;
    }

    const parsedProjectId = normalizePositiveInteger(createForm.projectId);
    if (!parsedProjectId) {
      createMutation.reset();
      setLocalCreateError('项目 ID 必须是正整数。');
      return;
    }

    const payload = buildDashboardPayload({
      projectId: parsedProjectId,
      name: createForm.name,
      description: createForm.description,
      layoutText: createForm.layoutText,
      configText: createForm.configText
    });

    if (!payload.ok) {
      createMutation.reset();
      setCreateForm((current) => ({ ...current }));
      setLocalCreateError(payload.message);
      return;
    }

    clearLocalCreateError();
    createMutation.mutate(payload.value);
  }

  function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authState.shouldRequest || !selectedDashboard) {
      return;
    }

    const payload = buildDashboardPatchPayload(selectedDashboard, visibleEditForm);

    if (!payload.ok) {
      updateMutation.reset();
      setLocalEditError(payload.message);
      return;
    }

    clearLocalEditError();
    updateMutation.mutate({ dashboard: selectedDashboard, payload: payload.value });
  }

  function handleDelete(dashboard: Dashboard) {
    deleteMutation.mutate(dashboard);
  }

  const clearLocalCreateError = () => setLocalCreateError(null);
  const clearLocalEditError = () => setLocalEditError(null);

  return (
    <div className="dashboards-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Dashboards</p>
          <h1>仪表盘</h1>
          <p className="workspace-summary">按项目管理 dashboard 元数据。当前版本保存名称、描述和最小 JSON 配置。</p>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              if (authState.shouldRequest) {
                projectsQuery.refetch();
                dashboardsQuery.refetch();
              }
            }}
            disabled={!authState.shouldRequest || dashboardsQuery.isFetching}
            title={authState.shouldRequest ? '刷新仪表盘' : '登录后刷新仪表盘'}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge
            tone={
              authState.status !== 'ready'
                ? 'warning'
                : anyLoading
                  ? 'warning'
                  : anyError
                    ? 'danger'
                    : 'success'
            }
          >
            {authState.status !== 'ready' ? authState.badgeLabel : anyLoading ? '加载中' : anyError ? '读取异常' : '已同步'}
          </StatusBadge>
        </div>
      </header>

      {authState.status !== 'ready' ? (
        <section className="settings-auth-notice" aria-live="polite">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{authState.status === 'signed-out' ? '登录后管理仪表盘' : authState.title}</strong>
            <p>
              {authState.status === 'signed-out'
                ? 'Dashboard 接口需要当前账号的访问令牌。'
                : authState.message}
            </p>
          </div>
          {authState.status !== 'restoring' ? (
            <Link className="text-button" to="/login" state={{ from: { pathname: location.pathname, search: location.search } }}>
              <LogIn size={16} aria-hidden="true" />
              <span>登录</span>
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="settings-summary" aria-label="仪表盘概览">
        <DashboardSummaryItem icon={LayoutDashboard} label="仪表盘" value={total} />
        <DashboardSummaryItem icon={BarChart3} label="当前列表" value={dashboards.length} />
        <DashboardSummaryItem icon={FileJson} label="项目" value={projects.length} />
      </section>

      <section className="dashboard-control-panel" aria-label="项目筛选">
        <div className="section-heading">
          <div>
            <h2>项目范围</h2>
            <p>{formatProjectScope(normalizedProjectId, selectedProject)}</p>
          </div>
          <LayoutDashboard size={20} aria-hidden="true" />
        </div>

        <div className="dashboard-project-controls">
          <label className="field">
            <span>项目</span>
            <select
              value={normalizedProjectId ? `${normalizedProjectId}` : ''}
              onChange={(event) => handleProjectSelect(event.target.value)}
              disabled={!authState.shouldRequest}
            >
              <option value="">全部可访问项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} / #{project.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>项目 ID</span>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={projectIdInput}
              onChange={(event) => handleProjectSelect(event.target.value)}
              placeholder="手动输入项目 ID"
              disabled={!authState.shouldRequest}
            />
          </label>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="仪表盘列表和表单">
        <article className="dashboard-list-panel">
          <div className="section-heading">
            <div>
              <h2>列表</h2>
              <p>{dashboardsQuery.data ? `${total} 条结果，最多显示 ${DASHBOARD_PAGE_LIMIT} 条。` : '等待仪表盘列表。'}</p>
            </div>
            <StatusBadge tone={anyError ? 'danger' : anyLoading ? 'warning' : dashboards.length > 0 ? 'success' : 'neutral'}>
              {anyError ? '读取失败' : anyLoading ? '加载中' : `${dashboards.length} 条`}
            </StatusBadge>
          </div>

          <DashboardListState
            canUseData={canUseData}
            isLoading={canUseData && dashboardsQuery.isLoading}
            isError={canUseData && dashboardsQuery.isError}
            error={dashboardsQuery.error}
            dashboards={dashboards}
            selectedDashboardId={editForm.dashboardId}
            deletingDashboardId={deleteMutation.variables?.id ?? null}
            isDeleting={deleteMutation.isPending}
            onSelect={(dashboard) => {
              setEditForm(dashboardToEditForm(dashboard));
              clearLocalEditError();
            }}
            onDelete={handleDelete}
          />
          <InlineError error={deleteFormError} />
        </article>

        <article className="dashboard-form-panel">
          <div className="section-heading">
            <div>
              <h2>创建</h2>
              <p>保存一个基础 dashboard 记录，后续图表 panel 会复用这里的 layout/config。</p>
            </div>
            <FileJson size={20} aria-hidden="true" />
          </div>

          <form className="dashboard-editor-form" onSubmit={handleCreateSubmit}>
            <label className="field">
              <span>项目 ID</span>
              <input
                type="number"
                min="1"
                required
                value={createForm.projectId}
                onChange={(event) => setCreateForm({ ...createForm, projectId: event.target.value })}
                disabled={!authState.shouldRequest}
              />
            </label>
            <label className="field">
              <span>名称</span>
              <input
                required
                maxLength={100}
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                placeholder="服务总览"
                disabled={!authState.shouldRequest}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                maxLength={500}
                value={createForm.description}
                onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
                placeholder="值班视图"
                disabled={!authState.shouldRequest}
              />
            </label>
            <JsonTextarea
              label="layout JSON"
              value={createForm.layoutText}
              onChange={(layoutText) => setCreateForm({ ...createForm, layoutText })}
              disabled={!authState.shouldRequest}
            />
            <JsonTextarea
              label="config JSON"
              value={createForm.configText}
              onChange={(configText) => setCreateForm({ ...createForm, configText })}
              disabled={!authState.shouldRequest}
            />
            <InlineError message={localCreateError} error={createFormError} />
            <button className="primary-button" type="submit" disabled={!authState.shouldRequest || createMutation.isPending}>
              {createMutation.isPending ? <LoaderCircle size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              <span>{createMutation.isPending ? '创建中' : '创建仪表盘'}</span>
            </button>
          </form>
        </article>

        <article className="dashboard-form-panel">
          <div className="section-heading">
            <div>
              <h2>编辑</h2>
              <p>{selectedDashboard ? `正在编辑 #${selectedDashboard.id}` : '从列表中选择一个 dashboard。'}</p>
            </div>
            <Pencil size={20} aria-hidden="true" />
          </div>

          <form className="dashboard-editor-form" onSubmit={handleEditSubmit}>
            <label className="field">
              <span>名称</span>
              <input
                required
                maxLength={100}
                value={visibleEditForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                disabled={!authState.shouldRequest || !selectedDashboard}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                maxLength={500}
                value={visibleEditForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                disabled={!authState.shouldRequest || !selectedDashboard}
              />
            </label>
            <JsonTextarea
              label="layout JSON"
              value={visibleEditForm.layoutText}
              onChange={(layoutText) => setEditForm({ ...editForm, layoutText })}
              disabled={!authState.shouldRequest || !selectedDashboard}
            />
            <JsonTextarea
              label="config JSON"
              value={visibleEditForm.configText}
              onChange={(configText) => setEditForm({ ...editForm, configText })}
              disabled={!authState.shouldRequest || !selectedDashboard}
            />
            <InlineError message={localEditError} error={updateFormError} />
            <button
              className="primary-button"
              type="submit"
              disabled={!authState.shouldRequest || !selectedDashboard || updateMutation.isPending}
            >
              {updateMutation.isPending ? <LoaderCircle size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              <span>{updateMutation.isPending ? '保存中' : '保存修改'}</span>
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}

function DashboardListState({
  canUseData,
  isLoading,
  isError,
  error,
  dashboards,
  selectedDashboardId,
  deletingDashboardId,
  isDeleting,
  onSelect,
  onDelete
}: {
  canUseData: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  dashboards: Dashboard[];
  selectedDashboardId: number | null;
  deletingDashboardId: number | null;
  isDeleting: boolean;
  onSelect: (dashboard: Dashboard) => void;
  onDelete: (dashboard: Dashboard) => void;
}) {
  if (!canUseData) {
    return (
      <div className="resource-state">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <strong>等待登录</strong>
          <span>登录后会加载当前账号可访问的 dashboard。</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="resource-state query-loading-state" role="status">
        <LoaderCircle size={18} aria-hidden="true" />
        <div>
          <strong>正在加载仪表盘</strong>
          <span>按当前项目范围读取 dashboard 列表。</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="resource-state resource-state--error" role="status">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <strong>仪表盘读取失败</strong>
          <span>{formatApiErrorMessage(error)}</span>
        </div>
      </div>
    );
  }

  if (dashboards.length === 0) {
    return (
      <div className="resource-state">
        <LayoutDashboard size={18} aria-hidden="true" />
        <div>
          <strong>暂无仪表盘</strong>
          <span>当前项目范围还没有 dashboard，可以先创建一个基础记录。</span>
        </div>
      </div>
    );
  }

  return (
    <ul className="dashboard-list">
      {dashboards.map((dashboard) => (
        <li key={dashboard.id} className={dashboard.id === selectedDashboardId ? 'is-selected' : undefined}>
          <button className="dashboard-list-item" type="button" onClick={() => onSelect(dashboard)}>
            <span>
              <strong>{dashboard.name}</strong>
              <small>{dashboard.description || '未填写描述'}</small>
            </span>
            <code>#{dashboard.project_id}</code>
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => onDelete(dashboard)}
            disabled={isDeleting && deletingDashboardId === dashboard.id}
            title="删除仪表盘"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function DashboardSummaryItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="summary-item">
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JsonTextarea({
  label,
  value,
  onChange,
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="field dashboard-json-field">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} spellCheck={false} />
    </label>
  );
}

function InlineError({ error, message }: { error?: unknown; message?: string | null }) {
  const text = message ?? (error ? readErrorMessage(error, 'form') : null);

  if (!text) {
    return null;
  }

  return (
    <div className="form-error" role="status">
      <ShieldAlert size={16} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function formatProjectScope(projectId: number | null, project: Project | null) {
  if (!projectId) {
    return '显示当前账号可访问的全部 dashboard。';
  }

  if (project) {
    return `仅显示 ${project.name} / #${project.id} 的 dashboard。`;
  }

  return `仅显示项目 #${projectId} 的 dashboard。`;
}

function invalidateDashboards(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: dashboardQueryRootKey });
}

function isAuthError(error: unknown) {
  return findUnauthorizedApiError([error]) === error;
}
