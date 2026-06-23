import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileJson,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
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
import {
  DASHBOARD_JSON_TEXT_MAX_LENGTH,
  createDefaultDashboardForm,
  dashboardToEditForm
} from '../features/dashboards/dashboardJson';
import {
  buildDashboardPatchPayload,
  buildDashboardPayload,
  normalizePositiveInteger
} from '../features/dashboards/dashboardPayload';
import {
  DASHBOARD_PANEL_TYPES,
  createDashboardPanelPreviewModel,
  createDefaultDashboardPanelDraft,
  dashboardPanelToDraft,
  readDashboardPanelsFromConfigText,
  removeDashboardPanelFromConfigText,
  upsertDashboardPanelInConfigText,
  type DashboardPanel,
  type DashboardPanelPreviewModel,
  type DashboardPanelDraft,
  type DashboardPanelsReadResult
} from '../features/dashboards/dashboardPanels';
import { dashboardQueryKeys, dashboardQueryRootKey } from '../features/dashboards/queryKeys';
import { findUnauthorizedApiError, resolveSettingsAuthState } from '../features/settings/authState';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { readErrorMessage } from '../features/settings/utils';

const DASHBOARD_PAGE_LIMIT = 50;
const emptyDashboards: Dashboard[] = [];
const emptyProjects: Project[] = [];

type CreateFormState = ReturnType<typeof createDefaultDashboardForm>;
type EditFormState = ReturnType<typeof dashboardToEditForm>;
type PanelDraftState = DashboardPanelDraft;
type ScopedState<TValue> = {
  scopeKey: string;
  value: TValue;
};

export function DashboardsPage() {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const shouldRequest = auth.canRequestAuthenticatedApi;
  const authScopeKey = buildDashboardAuthScopeKey(auth.sessionRevision, shouldRequest);
  const [projectIdInputState, setProjectIdInputState] = useState<ScopedState<string>>({ scopeKey: '', value: '' });
  const [createFormState, setCreateFormState] = useState<ScopedState<CreateFormState>>(() => ({
    scopeKey: '',
    value: createDefaultDashboardForm()
  }));
  const [editFormState, setEditFormState] = useState<ScopedState<EditFormState>>(() => ({
    scopeKey: '',
    value: dashboardToEditForm(null)
  }));
  const [panelDraftState, setPanelDraftState] = useState<ScopedState<PanelDraftState>>(() => ({
    scopeKey: '',
    value: createDefaultDashboardPanelDraft()
  }));
  const [dashboardOffsetState, setDashboardOffsetState] = useState<ScopedState<number>>({ scopeKey: '', value: 0 });
  const [formUnauthorizedErrorState, setFormUnauthorizedErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });
  const [createRemoteErrorState, setCreateRemoteErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });
  const [updateRemoteErrorState, setUpdateRemoteErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });
  const [deleteRemoteErrorState, setDeleteRemoteErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });
  const [deleteLocked, setDeleteLocked] = useState(false);
  const deleteInFlightRef = useRef(false);
  const [localCreateErrorState, setLocalCreateErrorState] = useState<ScopedState<string | null>>({
    scopeKey: '',
    value: null
  });
  const [localEditErrorState, setLocalEditErrorState] = useState<ScopedState<string | null>>({
    scopeKey: '',
    value: null
  });
  const scopedProjectIdInput =
    shouldRequest && projectIdInputState.scopeKey === authScopeKey ? projectIdInputState.value : '';
  const normalizedProjectId = normalizePositiveInteger(scopedProjectIdInput);
  const isProjectIdInputInvalid = scopedProjectIdInput.trim().length > 0 && !normalizedProjectId;
  const shouldRequestDashboards = shouldRequest && !isProjectIdInputInvalid;
  const dashboardOffsetScopeKey = buildDashboardOffsetScopeKey(authScopeKey, scopedProjectIdInput);
  const dashboardOffset =
    shouldRequest && dashboardOffsetState.scopeKey === dashboardOffsetScopeKey ? dashboardOffsetState.value : 0;
  const pageScopeKey = buildDashboardPageScopeKey({
    authScopeKey,
    projectIdInput: scopedProjectIdInput,
    dashboardOffset
  });
  const activeFormUnauthorizedError =
    formUnauthorizedErrorState.scopeKey === authScopeKey ? formUnauthorizedErrorState.value : null;

  const projectsQuery = useQuery({
    queryKey: settingsQueryKeys.projectList(auth.sessionRevision),
    queryFn: listProjects,
    enabled: shouldRequest,
    retry: false
  });

  const dashboardParams = useMemo<DashboardListParams>(
    () => ({
      project_id: normalizedProjectId ?? undefined,
      limit: DASHBOARD_PAGE_LIMIT,
      offset: dashboardOffset
    }),
    [dashboardOffset, normalizedProjectId]
  );
  const dashboardsQuery = useQuery({
    queryKey: dashboardQueryKeys.list(auth.sessionRevision, dashboardParams),
    queryFn: () => listDashboards(dashboardParams),
    enabled: shouldRequestDashboards,
    retry: false
  });

  const unauthorizedError =
    findUnauthorizedApiError([projectsQuery.error, dashboardsQuery.error]) ?? activeFormUnauthorizedError;
  const authState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: unauthorizedError
  });
  const canUseAuthData = authState.shouldRequest;
  const canUseDashboardData = canUseAuthData && !isProjectIdInputInvalid;
  const projectIdInput = canUseAuthData ? scopedProjectIdInput : '';
  const visibleProjectId = canUseAuthData ? normalizedProjectId : null;
  const projectIdInputInvalidForDisplay = canUseAuthData && isProjectIdInputInvalid;
  const activeCreateForm =
    canUseAuthData && createFormState.scopeKey === pageScopeKey
      ? createFormState.value
      : createDefaultDashboardForm(canUseAuthData && normalizedProjectId ? `${normalizedProjectId}` : '');
  const activeEditForm =
    canUseDashboardData && editFormState.scopeKey === pageScopeKey
      ? editFormState.value
      : dashboardToEditForm(null);
  const localCreateError =
    canUseAuthData && localCreateErrorState.scopeKey === pageScopeKey ? localCreateErrorState.value : null;
  const localEditError =
    canUseDashboardData && localEditErrorState.scopeKey === pageScopeKey ? localEditErrorState.value : null;
  const projects = canUseAuthData ? projectsQuery.data ?? emptyProjects : emptyProjects;
  const dashboards = canUseDashboardData ? dashboardsQuery.data?.items ?? emptyDashboards : emptyDashboards;
  const total = canUseDashboardData ? dashboardsQuery.data?.total ?? dashboards.length : 0;
  const selectedProject = visibleProjectId
    ? projects.find((project) => project.id === visibleProjectId) ?? null
    : null;
  const anyLoading =
    canUseAuthData && (projectsQuery.isLoading || (!projectIdInputInvalidForDisplay && dashboardsQuery.isLoading));
  const anyError =
    canUseAuthData && (projectsQuery.isError || (!projectIdInputInvalidForDisplay && dashboardsQuery.isError));
  const pageStart = total > 0 ? dashboardOffset + 1 : 0;
  const pageEnd = Math.min(dashboardOffset + dashboards.length, total);
  const hasPreviousPage = dashboardOffset > 0;
  const hasNextPage = dashboardOffset + dashboards.length < total;
  const isPageChanging = canUseDashboardData && dashboardsQuery.isFetching;

  const createMutation = useMutation({
    mutationFn: createDashboard,
    onSuccess: (dashboard) => {
      const nextProjectId = `${dashboard.project_id}`;
      const nextOffsetScopeKey = buildDashboardOffsetScopeKey(authScopeKey, nextProjectId);
      const nextPageScopeKey = buildDashboardPageScopeKey({
        authScopeKey,
        projectIdInput: nextProjectId,
        dashboardOffset: 0
      });
      setCreateFormState({ scopeKey: nextPageScopeKey, value: createDefaultDashboardForm(nextProjectId) });
      setProjectIdInputState({ scopeKey: authScopeKey, value: nextProjectId });
      setDashboardOffsetState({ scopeKey: nextOffsetScopeKey, value: 0 });
      setEditFormState({ scopeKey: nextPageScopeKey, value: dashboardToEditForm(dashboard) });
      setLocalCreateErrorState({ scopeKey: nextPageScopeKey, value: null });
      setLocalEditErrorState({ scopeKey: nextPageScopeKey, value: null });
      setCreateRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
      invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setCreateRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ dashboard, payload }: { dashboard: Dashboard; payload: Parameters<typeof updateDashboard>[2] }) =>
      updateDashboard(dashboard.project_id, dashboard.id, payload),
    onSuccess: (dashboard) => {
      setEditFormState({ scopeKey: pageScopeKey, value: dashboardToEditForm(dashboard) });
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: null });
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboard: Dashboard) => deleteDashboard(dashboard.project_id, dashboard.id),
    onSuccess: async (_result, dashboard) => {
      const nextOffset = resolveOffsetAfterDeletingOne(dashboardOffset, total, DASHBOARD_PAGE_LIMIT);
      if (activeEditForm.dashboardId === dashboard.id) {
        setEditFormState({ scopeKey: pageScopeKey, value: dashboardToEditForm(null) });
      }
      if (nextOffset !== dashboardOffset) {
        setDashboardOffsetState({ scopeKey: dashboardOffsetScopeKey, value: nextOffset });
      }
      setDeleteRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      await invalidateDashboards(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setDeleteRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    },
    onSettled: () => {
      deleteInFlightRef.current = false;
      setDeleteLocked(false);
    }
  });

  const createFormError = createRemoteErrorState.scopeKey === pageScopeKey ? createRemoteErrorState.value : null;
  const updateFormError = updateRemoteErrorState.scopeKey === pageScopeKey ? updateRemoteErrorState.value : null;
  const deleteFormError = deleteRemoteErrorState.scopeKey === pageScopeKey ? deleteRemoteErrorState.value : null;
  const isDeleteLocked = deleteLocked || deleteMutation.isPending;
  const selectedDashboard = canUseDashboardData
    ? dashboards.find((dashboard) => dashboard.id === activeEditForm.dashboardId) ?? null
    : null;
  const visibleEditForm = selectedDashboard ? activeEditForm : dashboardToEditForm(null);
  const panelReadResult = selectedDashboard
    ? readDashboardPanelsFromConfigText(visibleEditForm.configText)
    : createEmptyPanelReadResult();
  const visiblePanels = panelReadResult.ok ? panelReadResult.panels : [];
  const panelPreviewModel = createDashboardPanelPreviewModel(panelReadResult);
  const panelScopeKey = buildDashboardPanelScopeKey(pageScopeKey, visibleEditForm.dashboardId);
  const activePanelDraft =
    selectedDashboard && panelDraftState.scopeKey === panelScopeKey
      ? panelDraftState.value
      : createDefaultDashboardPanelDraft(visiblePanels);

  function handleProjectSelect(value: string) {
    const nextProjectId = normalizePositiveInteger(value) ? value : '';
    const nextOffsetScopeKey = buildDashboardOffsetScopeKey(authScopeKey, value);
    const nextPageScopeKey = buildDashboardPageScopeKey({
      authScopeKey,
      projectIdInput: value,
      dashboardOffset: 0
    });
    setProjectIdInputState({ scopeKey: authScopeKey, value });
    setCreateFormState({
      scopeKey: nextPageScopeKey,
      value: createDefaultDashboardForm(nextProjectId)
    });
    setEditFormState({ scopeKey: nextPageScopeKey, value: dashboardToEditForm(null) });
    setPanelDraftState({
      scopeKey: buildDashboardPanelScopeKey(nextPageScopeKey, null),
      value: createDefaultDashboardPanelDraft()
    });
    setDashboardOffsetState({ scopeKey: nextOffsetScopeKey, value: 0 });
    setLocalCreateErrorState({ scopeKey: nextPageScopeKey, value: null });
    setLocalEditErrorState({ scopeKey: nextPageScopeKey, value: null });
    setCreateRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    setUpdateRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    setDeleteRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
  }

  function updateCreateForm(value: CreateFormState) {
    setCreateFormState({ scopeKey: pageScopeKey, value });
  }

  function updateEditForm(value: EditFormState) {
    setEditFormState({ scopeKey: pageScopeKey, value });
  }

  function updatePanelDraft(value: PanelDraftState) {
    setPanelDraftState({ scopeKey: panelScopeKey, value });
  }

  function resetPanelDraft(configText = visibleEditForm.configText) {
    const panels = readDashboardPanelsFromConfigText(configText);
    setPanelDraftState({
      scopeKey: panelScopeKey,
      value: createDefaultDashboardPanelDraft(panels.ok ? panels.panels : [])
    });
  }

  function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authState.shouldRequest) {
      return;
    }

    const parsedProjectId = normalizePositiveInteger(activeCreateForm.projectId);
    if (!parsedProjectId) {
      createMutation.reset();
      setCreateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      setLocalCreateErrorState({ scopeKey: pageScopeKey, value: '项目 ID 必须是正整数。' });
      return;
    }

    const payload = buildDashboardPayload({
      projectId: parsedProjectId,
      name: activeCreateForm.name,
      description: activeCreateForm.description,
      layoutText: activeCreateForm.layoutText,
      configText: activeCreateForm.configText
    });

    if (!payload.ok) {
      createMutation.reset();
      setCreateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      setLocalCreateErrorState({ scopeKey: pageScopeKey, value: payload.message });
      return;
    }

    clearLocalCreateError();
    setCreateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
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
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: payload.message });
      return;
    }

    clearLocalEditError();
    setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
    updateMutation.mutate({ dashboard: selectedDashboard, payload: payload.value });
  }

  function handleDelete(dashboard: Dashboard) {
    if (deleteInFlightRef.current || deleteMutation.isPending) {
      return;
    }

    deleteInFlightRef.current = true;
    setDeleteLocked(true);
    setDeleteRemoteErrorState({ scopeKey: pageScopeKey, value: null });
    deleteMutation.mutate(dashboard);
  }

  function handlePanelApply() {
    if (!selectedDashboard) {
      return;
    }

    const result = upsertDashboardPanelInConfigText(visibleEditForm.configText, activePanelDraft);
    if (!result.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: result.message });
      return;
    }

    updateEditForm({ ...visibleEditForm, configText: result.configText });
    clearLocalEditError();
    resetPanelDraft(result.configText);
  }

  function handlePanelDelete(index: number) {
    if (!selectedDashboard) {
      return;
    }

    const result = removeDashboardPanelFromConfigText(visibleEditForm.configText, index);
    if (!result.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: result.message });
      return;
    }

    updateEditForm({ ...visibleEditForm, configText: result.configText });
    clearLocalEditError();
    resetPanelDraft(result.configText);
  }

  const clearLocalCreateError = () => setLocalCreateErrorState({ scopeKey: pageScopeKey, value: null });
  const clearLocalEditError = () => setLocalEditErrorState({ scopeKey: pageScopeKey, value: null });

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
            <p>{formatProjectScope(visibleProjectId, selectedProject)}</p>
          </div>
          <LayoutDashboard size={20} aria-hidden="true" />
        </div>

        <div className="dashboard-project-controls">
          <label className="field">
            <span>项目</span>
            <select
              value={visibleProjectId ? `${visibleProjectId}` : ''}
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
              <p>
                {projectIdInputInvalidForDisplay
                  ? '项目 ID 需为正整数。'
                  : dashboardsQuery.data
                    ? formatDashboardPageSummary(pageStart, pageEnd, total, DASHBOARD_PAGE_LIMIT)
                    : '等待仪表盘列表。'}
              </p>
            </div>
            <StatusBadge
              tone={
                anyError
                  ? 'danger'
                  : projectIdInputInvalidForDisplay
                    ? 'warning'
                    : anyLoading
                      ? 'warning'
                      : dashboards.length > 0
                        ? 'success'
                        : 'neutral'
              }
            >
              {anyError
                ? '读取失败'
                : projectIdInputInvalidForDisplay
                  ? '待修正'
                  : anyLoading
                    ? '加载中'
                    : `${dashboards.length} 条`}
            </StatusBadge>
          </div>

          <DashboardListState
            authReady={canUseAuthData}
            projectIdInvalid={projectIdInputInvalidForDisplay}
            isLoading={canUseDashboardData && dashboardsQuery.isLoading}
            isError={canUseDashboardData && dashboardsQuery.isError}
            error={dashboardsQuery.error}
            dashboards={dashboards}
            selectedDashboardId={activeEditForm.dashboardId}
            isDeleting={isDeleteLocked}
            onSelect={(dashboard) => {
              updateEditForm(dashboardToEditForm(dashboard));
              clearLocalEditError();
            }}
            onDelete={handleDelete}
          />
          <DashboardPagination
            canUseData={canUseDashboardData}
            isFetching={isPageChanging}
            pageStart={pageStart}
            pageEnd={pageEnd}
            total={total}
            limit={DASHBOARD_PAGE_LIMIT}
            hasPreviousPage={hasPreviousPage}
            hasNextPage={hasNextPage}
            onPrevious={() => {
              updateEditForm(dashboardToEditForm(null));
              setDashboardOffsetState({
                scopeKey: dashboardOffsetScopeKey,
                value: Math.max(0, dashboardOffset - DASHBOARD_PAGE_LIMIT)
              });
            }}
            onNext={() => {
              updateEditForm(dashboardToEditForm(null));
              setDashboardOffsetState({
                scopeKey: dashboardOffsetScopeKey,
                value: dashboardOffset + DASHBOARD_PAGE_LIMIT
              });
            }}
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
                value={activeCreateForm.projectId}
                onChange={(event) => updateCreateForm({ ...activeCreateForm, projectId: event.target.value })}
                disabled={!authState.shouldRequest}
              />
            </label>
            <label className="field">
              <span>名称</span>
              <input
                required
                maxLength={100}
                value={activeCreateForm.name}
                onChange={(event) => updateCreateForm({ ...activeCreateForm, name: event.target.value })}
                placeholder="服务总览"
                disabled={!authState.shouldRequest}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                maxLength={500}
                value={activeCreateForm.description}
                onChange={(event) => updateCreateForm({ ...activeCreateForm, description: event.target.value })}
                placeholder="值班视图"
                disabled={!authState.shouldRequest}
              />
            </label>
            <JsonTextarea
              label="layout JSON"
              value={activeCreateForm.layoutText}
              onChange={(layoutText) => updateCreateForm({ ...activeCreateForm, layoutText })}
              disabled={!authState.shouldRequest}
            />
            <JsonTextarea
              label="config JSON"
              value={activeCreateForm.configText}
              onChange={(configText) => updateCreateForm({ ...activeCreateForm, configText })}
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
                onChange={(event) => updateEditForm({ ...visibleEditForm, name: event.target.value })}
                disabled={!authState.shouldRequest || !selectedDashboard}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                maxLength={500}
                value={visibleEditForm.description}
                onChange={(event) => updateEditForm({ ...visibleEditForm, description: event.target.value })}
                disabled={!authState.shouldRequest || !selectedDashboard}
              />
            </label>
            <JsonTextarea
              label="layout JSON"
              value={visibleEditForm.layoutText}
              onChange={(layoutText) => updateEditForm({ ...visibleEditForm, layoutText })}
              disabled={!authState.shouldRequest || !selectedDashboard}
            />
            <JsonTextarea
              label="config JSON"
              value={visibleEditForm.configText}
              onChange={(configText) => updateEditForm({ ...visibleEditForm, configText })}
              disabled={!authState.shouldRequest || !selectedDashboard}
            />
            <DashboardPanelPreview
              authReady={authState.shouldRequest}
              selected={Boolean(selectedDashboard)}
              model={panelPreviewModel}
            />
            <DashboardPanelEditor
              disabled={!authState.shouldRequest || !selectedDashboard}
              panelReadResult={panelReadResult}
              panels={visiblePanels}
              draft={activePanelDraft}
              onDraftChange={updatePanelDraft}
              onNew={() => resetPanelDraft()}
              onSelect={(panel, index) => updatePanelDraft(dashboardPanelToDraft(panel, index))}
              onDelete={handlePanelDelete}
              onApply={handlePanelApply}
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
  authReady,
  projectIdInvalid,
  isLoading,
  isError,
  error,
  dashboards,
  selectedDashboardId,
  isDeleting,
  onSelect,
  onDelete
}: {
  authReady: boolean;
  projectIdInvalid: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  dashboards: Dashboard[];
  selectedDashboardId: number | null;
  isDeleting: boolean;
  onSelect: (dashboard: Dashboard) => void;
  onDelete: (dashboard: Dashboard) => void;
}) {
  if (!authReady) {
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

  if (projectIdInvalid) {
    return (
      <div className="resource-state resource-state--error" role="status">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <strong>项目 ID 无效</strong>
          <span>请输入正整数项目 ID，或清空后查看全部可访问项目。</span>
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
            disabled={isDeleting}
            title="删除仪表盘"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function DashboardPagination({
  canUseData,
  isFetching,
  pageStart,
  pageEnd,
  total,
  limit,
  hasPreviousPage,
  hasNextPage,
  onPrevious,
  onNext
}: {
  canUseData: boolean;
  isFetching: boolean;
  pageStart: number;
  pageEnd: number;
  total: number;
  limit: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="dashboard-pagination" aria-label="仪表盘分页">
      <span>{formatDashboardPageSummary(pageStart, pageEnd, total, limit)}</span>
      <div className="dashboard-pagination-actions">
        <button
          className="text-button"
          type="button"
          onClick={onPrevious}
          disabled={!canUseData || isFetching || !hasPreviousPage}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span>上一页</span>
        </button>
        <button
          className="text-button"
          type="button"
          onClick={onNext}
          disabled={!canUseData || isFetching || !hasNextPage}
        >
          <span>下一页</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
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
      <textarea
        aria-label={label}
        value={value}
        maxLength={DASHBOARD_JSON_TEXT_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        spellCheck={false}
      />
      <small>最多 64 KiB，嵌套不超过 32 层，复杂度不超过 4096 个节点。</small>
    </label>
  );
}

function DashboardPanelPreview({
  authReady,
  selected,
  model
}: {
  authReady: boolean;
  selected: boolean;
  model: DashboardPanelPreviewModel;
}) {
  if (!authReady) {
    return (
      <div className="dashboard-panel-preview" aria-label="Panel 预览">
        <DashboardPanelPreviewHeading statusLabel="待登录" tone="warning" />
        <div className="resource-state dashboard-panel-preview-state">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>等待登录</strong>
            <span>登录后选择 dashboard 可查看本地 config.panels 预览。</span>
          </div>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="dashboard-panel-preview" aria-label="Panel 预览">
        <DashboardPanelPreviewHeading statusLabel="未选择" tone="neutral" />
        <div className="resource-state dashboard-panel-preview-state">
          <LayoutDashboard size={18} aria-hidden="true" />
          <div>
            <strong>未选择 dashboard</strong>
            <span>从列表中选择一个 dashboard 后，会按当前 config JSON 显示只读 panel 预览。</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-panel-preview" aria-label="Panel 预览">
      <DashboardPanelPreviewHeading
        statusLabel={model.statusLabel}
        tone={model.state === 'invalid' ? 'danger' : model.state === 'ready' ? 'success' : 'neutral'}
      />

      {model.state === 'ready' ? (
        <>
          <p className="dashboard-panel-preview-help">{model.message}</p>
          <ol
            className="dashboard-panel-preview-grid"
            style={{ gridTemplateColumns: `repeat(${model.columns}, minmax(0, 1fr))` }}
          >
            {model.panels.map((panel) => (
              <li key={`${panel.id}-${panel.originalIndex}`} style={{ gridColumn: panel.gridColumn }}>
                <div className="dashboard-panel-preview-card">
                  <div className="dashboard-panel-preview-card-heading">
                    <div>
                      <strong>{panel.title}</strong>
                      <span>
                        {panel.type} / {panel.id}
                      </span>
                    </div>
                    <code>#{panel.originalIndex + 1}</code>
                  </div>
                  <dl className="dashboard-panel-preview-meta">
                    <div>
                      <dt>Layout</dt>
                      <dd>{panel.layoutLabel}</dd>
                    </div>
                    <div>
                      <dt>Query</dt>
                      <dd>{panel.querySummary}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div
          className={`resource-state dashboard-panel-preview-state${
            model.state === 'invalid' ? ' resource-state--error' : ''
          }`}
          role={model.state === 'invalid' ? 'status' : undefined}
        >
          {model.state === 'invalid' ? (
            <ShieldAlert size={18} aria-hidden="true" />
          ) : (
            <LayoutDashboard size={18} aria-hidden="true" />
          )}
          <div>
            <strong>{resolveDashboardPanelPreviewStateTitle(model.state)}</strong>
            <span>{model.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPanelPreviewHeading({
  statusLabel,
  tone
}: {
  statusLabel: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  return (
    <div className="dashboard-panel-preview-heading">
      <div>
        <strong>Panel 预览</strong>
        <span>只读显示当前 config JSON 中的 panels，不请求图表数据。</span>
      </div>
      <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
    </div>
  );
}

function DashboardPanelEditor({
  disabled,
  panelReadResult,
  panels,
  draft,
  onDraftChange,
  onNew,
  onSelect,
  onDelete,
  onApply
}: {
  disabled: boolean;
  panelReadResult: DashboardPanelsReadResult;
  panels: DashboardPanel[];
  draft: DashboardPanelDraft;
  onDraftChange: (draft: DashboardPanelDraft) => void;
  onNew: () => void;
  onSelect: (panel: DashboardPanel, index: number) => void;
  onDelete: (index: number) => void;
  onApply: () => void;
}) {
  return (
    <div className="dashboard-panel-editor" aria-label="Panel 配置">
      <div className="dashboard-panel-heading">
        <div>
          <strong>Panels</strong>
          <span>{panelReadResult.ok ? `${panels.length} 个 panel` : panelReadResult.message}</span>
        </div>
        <button className="text-button" type="button" onClick={onNew} disabled={disabled || !panelReadResult.ok}>
          <Plus size={16} aria-hidden="true" />
          <span>新增</span>
        </button>
      </div>

      {panelReadResult.ok ? (
        panels.length > 0 ? (
          <ul className="dashboard-panel-list">
            {panels.map((panel, index) => (
              <li key={`${panel.id}-${index}`} className={draft.mode === 'edit' && draft.editIndex === index ? 'is-selected' : undefined}>
                <button className="dashboard-panel-list-item" type="button" onClick={() => onSelect(panel, index)} disabled={disabled}>
                  <span>
                    <strong>{panel.title}</strong>
                    <small>
                      {panel.id} / {panel.type}
                    </small>
                  </span>
                  <code>
                    {panel.layout
                      ? `${panel.layout.x},${panel.layout.y} ${panel.layout.w}x${panel.layout.h}`
                      : 'no layout'}
                  </code>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onDelete(index)}
                  disabled={disabled}
                  title="删除 panel"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="resource-state dashboard-panel-empty">
            <LayoutDashboard size={18} aria-hidden="true" />
            <div>
              <strong>{panelReadResult.hasPanels ? '暂无 panel' : 'Legacy config'}</strong>
              <span>{panelReadResult.hasPanels ? '当前 panels 数组为空。' : '当前 config 未包含 panels，可直接新增。'}</span>
            </div>
          </div>
        )
      ) : (
        <div className="resource-state resource-state--error dashboard-panel-empty" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>Panel 配置不可用</strong>
            <span>{panelReadResult.message}</span>
          </div>
        </div>
      )}

      <div className="dashboard-panel-form">
        <label className="field">
          <span>Panel ID</span>
          <input
            value={draft.id}
            maxLength={64}
            onChange={(event) => onDraftChange({ ...draft, id: event.target.value })}
            disabled={disabled || !panelReadResult.ok}
          />
        </label>
        <label className="field">
          <span>标题</span>
          <input
            value={draft.title}
            maxLength={120}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            disabled={disabled || !panelReadResult.ok}
          />
        </label>
        <label className="field">
          <span>类型</span>
          <select
            value={draft.type}
            onChange={(event) => onDraftChange({ ...draft, type: event.target.value as DashboardPanelDraft['type'] })}
            disabled={disabled || !panelReadResult.ok}
          >
            {DASHBOARD_PANEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="field dashboard-panel-query-field">
          <span>query JSON</span>
          <textarea
            aria-label="panel query JSON"
            value={draft.queryText}
            onChange={(event) => onDraftChange({ ...draft, queryText: event.target.value })}
            disabled={disabled || !panelReadResult.ok}
            spellCheck={false}
          />
        </label>
        <div className="dashboard-panel-layout-fields">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key}</span>
              <input
                type="number"
                min={key === 'x' || key === 'y' ? '0' : '1'}
                step="any"
                value={draft.layout[key]}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    layout: {
                      ...draft.layout,
                      [key]: event.target.value
                    }
                  })
                }
                disabled={disabled || !panelReadResult.ok}
              />
            </label>
          ))}
        </div>
        <button className="text-button dashboard-panel-apply" type="button" onClick={onApply} disabled={disabled || !panelReadResult.ok}>
          <Save size={16} aria-hidden="true" />
          <span>{draft.mode === 'edit' ? '更新 panel' : '添加 panel'}</span>
        </button>
      </div>
    </div>
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

function formatDashboardPageSummary(pageStart: number, pageEnd: number, total: number, limit: number) {
  if (total === 0) {
    return `0 条结果，每页 ${limit} 条。`;
  }

  return `第 ${pageStart}-${pageEnd} 条，共 ${total} 条，每页 ${limit} 条。`;
}

function resolveDashboardPanelPreviewStateTitle(state: DashboardPanelPreviewModel['state']) {
  if (state === 'invalid') {
    return 'Panel 预览不可用';
  }

  if (state === 'empty') {
    return '暂无 panel';
  }

  return 'Legacy config';
}

function resolveOffsetAfterDeletingOne(currentOffset: number, currentTotal: number, limit: number) {
  const nextTotal = Math.max(0, currentTotal - 1);
  const lastOffset = nextTotal > 0 ? Math.floor((nextTotal - 1) / limit) * limit : 0;

  return Math.min(currentOffset, lastOffset);
}

function buildDashboardAuthScopeKey(sessionRevision: number, shouldRequest: boolean) {
  return JSON.stringify({ sessionRevision, shouldRequest });
}

function buildDashboardOffsetScopeKey(authScopeKey: string, projectIdInput: string) {
  return JSON.stringify({ authScopeKey, projectIdInput });
}

function buildDashboardPageScopeKey({
  authScopeKey,
  projectIdInput,
  dashboardOffset
}: {
  authScopeKey: string;
  projectIdInput: string;
  dashboardOffset: number;
}) {
  return JSON.stringify({ authScopeKey, projectIdInput, dashboardOffset });
}

function buildDashboardPanelScopeKey(pageScopeKey: string, dashboardId: number | null) {
  return JSON.stringify({ pageScopeKey, dashboardId });
}

function createEmptyPanelReadResult(): DashboardPanelsReadResult {
  return {
    ok: true,
    config: {},
    panels: [],
    hasPanels: false
  };
}

function invalidateDashboards(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: dashboardQueryRootKey });
}

function isAuthError(error: unknown) {
  return findUnauthorizedApiError([error]) === error;
}
