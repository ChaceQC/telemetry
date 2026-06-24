import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
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
import { useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  previewDashboardPanel,
  updateDashboard,
  type Dashboard,
  type DashboardListParams,
  type DashboardPanelPreviewResponse,
  type DashboardPanelPreviewVariables
} from '../api/dashboards';
import { formatApiErrorMessage } from '../api/http';
import { listProjects, type Project } from '../api/settings';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import {
  DASHBOARD_JSON_TEXT_MAX_LENGTH,
  createDefaultDashboardForm,
  dashboardToEditForm,
  formatDashboardJson
} from '../features/dashboards/dashboardJson';
import {
  buildDashboardPatchPayload,
  buildDashboardPayload,
  normalizePositiveInteger
} from '../features/dashboards/dashboardPayload';
import {
  DASHBOARD_PANEL_TYPES,
  createDashboardPanelPreviewModel,
  createDashboardPanelRemotePreviewModel,
  createDefaultDashboardPanelDraft,
  dashboardPanelToDraft,
  readDashboardPanelsFromConfigText,
  removeDashboardPanelFromConfigText,
  summarizeDashboardPanelQuery,
  upsertDashboardPanelInConfigText,
  type DashboardPanel,
  type DashboardPanelPreviewModel,
  type DashboardPanelPreviewItem,
  type DashboardPanelDraft,
  type DashboardPanelRemotePreviewVisualizationModel,
  type DashboardPanelsReadResult
} from '../features/dashboards/dashboardPanels';
import {
  DASHBOARD_TIME_RANGE_RELATIVES,
  DEFAULT_DASHBOARD_TIME_RANGE_RELATIVE,
  createDefaultDashboardTimeRangeDraft,
  isDashboardRelativeTimeRange,
  readDashboardTimeRangeFromConfigText,
  writeDashboardTimeRangeToConfigText,
  type DashboardTimeRangeDraft,
  type DashboardTimeRangeReadResult
} from '../features/dashboards/dashboardTimeRange';
import {
  DASHBOARD_VARIABLE_TYPES,
  buildDashboardVariableRuntimeOverrides,
  createDefaultDashboardVariableDraft,
  dashboardVariableToDraft,
  formatDashboardVariableFallbackLabel,
  formatDashboardVariableOptions,
  readDashboardVariablesFromConfigText,
  removeDashboardVariableFromConfigText,
  upsertDashboardVariableInConfigText,
  type DashboardVariable,
  type DashboardVariableDraft,
  type DashboardVariableRuntimeDraftValues,
  type DashboardVariablesReadResult
} from '../features/dashboards/dashboardVariables';
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
type VariableDraftState = DashboardVariableDraft;
type VariableRuntimeDraftState = DashboardVariableRuntimeDraftValues;
type PreviewVariablesState = {
  values: DashboardPanelPreviewVariables;
  signature: string | null;
};
type TimeRangeDraftState = {
  configText: string;
  result: DashboardTimeRangeReadResult;
};
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
  const [variableDraftState, setVariableDraftState] = useState<ScopedState<VariableDraftState>>(() => ({
    scopeKey: '',
    value: createDefaultDashboardVariableDraft()
  }));
  const [variableRuntimeDraftState, setVariableRuntimeDraftState] = useState<ScopedState<VariableRuntimeDraftState>>({
    scopeKey: '',
    value: {}
  });
  const [timeRangeDraftState, setTimeRangeDraftState] = useState<ScopedState<TimeRangeDraftState | null>>({
    scopeKey: '',
    value: null
  });
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
  const [selectedPreviewPanelState, setSelectedPreviewPanelState] = useState<ScopedState<string | null>>({
    scopeKey: '',
    value: null
  });
  const [previewVariablesState, setPreviewVariablesState] = useState<ScopedState<PreviewVariablesState>>({
    scopeKey: '',
    value: createEmptyPreviewVariablesState()
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

  const baseUnauthorizedError =
    findUnauthorizedApiError([projectsQuery.error, dashboardsQuery.error]) ?? activeFormUnauthorizedError;
  const baseAuthState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: baseUnauthorizedError
  });
  const canUseAuthDataBeforePanelPreview = baseAuthState.shouldRequest;
  const canUseDashboardData = canUseAuthDataBeforePanelPreview && !isProjectIdInputInvalid;
  const projectIdInput = canUseAuthDataBeforePanelPreview ? scopedProjectIdInput : '';
  const visibleProjectId = canUseAuthDataBeforePanelPreview ? normalizedProjectId : null;
  const projectIdInputInvalidForDisplay = canUseAuthDataBeforePanelPreview && isProjectIdInputInvalid;
  const activeCreateForm =
    canUseAuthDataBeforePanelPreview && createFormState.scopeKey === pageScopeKey
      ? createFormState.value
      : createDefaultDashboardForm(
          canUseAuthDataBeforePanelPreview && normalizedProjectId ? `${normalizedProjectId}` : ''
        );
  const activeEditForm =
    canUseDashboardData && editFormState.scopeKey === pageScopeKey
      ? editFormState.value
      : dashboardToEditForm(null);
  const localCreateError =
    canUseAuthDataBeforePanelPreview && localCreateErrorState.scopeKey === pageScopeKey
      ? localCreateErrorState.value
      : null;
  const localEditError =
    canUseDashboardData && localEditErrorState.scopeKey === pageScopeKey ? localEditErrorState.value : null;
  const projects = canUseAuthDataBeforePanelPreview ? projectsQuery.data ?? emptyProjects : emptyProjects;
  const dashboards = canUseDashboardData ? dashboardsQuery.data?.items ?? emptyDashboards : emptyDashboards;
  const total = canUseDashboardData ? dashboardsQuery.data?.total ?? dashboards.length : 0;
  const selectedProject = visibleProjectId
    ? projects.find((project) => project.id === visibleProjectId) ?? null
    : null;
  const anyLoading =
    canUseAuthDataBeforePanelPreview &&
    (projectsQuery.isLoading || (!projectIdInputInvalidForDisplay && dashboardsQuery.isLoading));
  const anyError =
    canUseAuthDataBeforePanelPreview &&
    (projectsQuery.isError || (!projectIdInputInvalidForDisplay && dashboardsQuery.isError));
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
      setTimeRangeDraftState({ scopeKey: '', value: null });
      setVariableRuntimeDraftState({ scopeKey: '', value: {} });
      setSelectedPreviewPanelState({ scopeKey: buildDashboardPanelScopeKey(nextPageScopeKey, dashboard.id), value: null });
      setPreviewVariablesState({
        scopeKey: buildDashboardPanelScopeKey(nextPageScopeKey, dashboard.id),
        value: createEmptyPreviewVariablesState()
      });
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
      setTimeRangeDraftState({ scopeKey: '', value: null });
      setVariableRuntimeDraftState({ scopeKey: '', value: {} });
      setSelectedPreviewPanelState({ scopeKey: buildDashboardPanelScopeKey(pageScopeKey, dashboard.id), value: null });
      setPreviewVariablesState({
        scopeKey: buildDashboardPanelScopeKey(pageScopeKey, dashboard.id),
        value: createEmptyPreviewVariablesState()
      });
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
        setTimeRangeDraftState({ scopeKey: '', value: null });
        setVariableRuntimeDraftState({ scopeKey: '', value: {} });
        setPreviewVariablesState({ scopeKey: panelScopeKey, value: createEmptyPreviewVariablesState() });
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
  const variableReadResult = selectedDashboard
    ? readDashboardVariablesFromConfigText(visibleEditForm.configText)
    : createEmptyVariableReadResult();
  const timeRangeScopeKey = buildDashboardTimeRangeScopeKey(pageScopeKey, visibleEditForm.dashboardId);
  const configTimeRangeReadResult = selectedDashboard
    ? readDashboardTimeRangeFromConfigText(visibleEditForm.configText)
    : createEmptyTimeRangeReadResult();
  const activeTimeRangeDraft =
    selectedDashboard &&
    timeRangeDraftState.scopeKey === timeRangeScopeKey &&
    timeRangeDraftState.value?.configText === visibleEditForm.configText
      ? timeRangeDraftState.value
      : null;
  const timeRangeReadResult = activeTimeRangeDraft?.result ?? configTimeRangeReadResult;
  const visiblePanels = panelReadResult.ok ? panelReadResult.panels : [];
  const visibleVariables = variableReadResult.ok ? variableReadResult.variables : [];
  const panelPreviewModel = createDashboardPanelPreviewModel(panelReadResult);
  const panelScopeKey = buildDashboardPanelScopeKey(pageScopeKey, visibleEditForm.dashboardId);
  const activePanelDraft =
    selectedDashboard && panelDraftState.scopeKey === panelScopeKey
      ? panelDraftState.value
      : createDefaultDashboardPanelDraft(visiblePanels);
  const variableScopeKey = buildDashboardVariableScopeKey(pageScopeKey, visibleEditForm.dashboardId);
  const activeVariableDraft =
    selectedDashboard && variableDraftState.scopeKey === variableScopeKey
      ? variableDraftState.value
      : createDefaultDashboardVariableDraft(visibleVariables);
  const activeVariableRuntimeDraft =
    selectedDashboard && variableRuntimeDraftState.scopeKey === panelScopeKey ? variableRuntimeDraftState.value : {};
  const remotePreviewPanelId =
    selectedDashboard && selectedPreviewPanelState.scopeKey === panelScopeKey ? selectedPreviewPanelState.value : null;
  const activePreviewVariables =
    selectedDashboard && previewVariablesState.scopeKey === panelScopeKey
      ? previewVariablesState.value
      : createEmptyPreviewVariablesState();
  const savedPanelReadResult = selectedDashboard
    ? readDashboardPanelsFromConfigText(formatDashboardJson(selectedDashboard.config))
    : createEmptyPanelReadResult();
  const hasUnsavedDashboardConfig =
    selectedDashboard !== null && visibleEditForm.configText !== formatDashboardJson(selectedDashboard.config);
  const remotePreviewPanel =
    selectedDashboard && panelPreviewModel.state === 'ready' && remotePreviewPanelId
      ? panelPreviewModel.panels.find((panel) => panel.id === remotePreviewPanelId) ?? null
      : null;
  const canRequestRemotePreview =
    canUseAuthDataBeforePanelPreview &&
    Boolean(selectedDashboard) &&
    !hasUnsavedDashboardConfig &&
    Boolean(remotePreviewPanel) &&
    Boolean(
      remotePreviewPanelId &&
        savedPanelReadResult.ok &&
        savedPanelReadResult.panels.some((panel) => panel.id === remotePreviewPanelId)
    );
  const panelPreviewQuery = useQuery({
    queryKey:
      selectedDashboard && remotePreviewPanelId
        ? dashboardQueryKeys.panelPreview(
            auth.sessionRevision,
            selectedDashboard.project_id,
            selectedDashboard.id,
            remotePreviewPanelId,
            activePreviewVariables.signature
          )
        : dashboardQueryKeys.panelPreview(auth.sessionRevision, 0, 0, ''),
    queryFn: () => {
      if (!selectedDashboard || !remotePreviewPanelId) {
        throw new Error('请选择要预览的 panel。');
      }

      if (activePreviewVariables.signature) {
        return previewDashboardPanel(
          selectedDashboard.project_id,
          selectedDashboard.id,
          remotePreviewPanelId,
          activePreviewVariables.values
        );
      }

      return previewDashboardPanel(selectedDashboard.project_id, selectedDashboard.id, remotePreviewPanelId);
    },
    enabled: canRequestRemotePreview,
    retry: false
  });
  const unauthorizedError = baseUnauthorizedError;
  const authState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: unauthorizedError
  });
  const canUseAuthData = authState.shouldRequest;

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
    setVariableDraftState({
      scopeKey: buildDashboardVariableScopeKey(nextPageScopeKey, null),
      value: createDefaultDashboardVariableDraft()
    });
    setVariableRuntimeDraftState({ scopeKey: '', value: {} });
    setTimeRangeDraftState({ scopeKey: '', value: null });
    setSelectedPreviewPanelState({ scopeKey: buildDashboardPanelScopeKey(nextPageScopeKey, null), value: null });
    setPreviewVariablesState({
      scopeKey: buildDashboardPanelScopeKey(nextPageScopeKey, null),
      value: createEmptyPreviewVariablesState()
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

  function updateVariableDraft(value: VariableDraftState) {
    setVariableDraftState({ scopeKey: variableScopeKey, value });
  }

  function updateVariableRuntimeDraft(variableName: string, value: string) {
    setVariableRuntimeDraftState({
      scopeKey: panelScopeKey,
      value: {
        ...activeVariableRuntimeDraft,
        [variableName]: value
      }
    });
  }

  function resetPanelDraft(configText = visibleEditForm.configText) {
    const panels = readDashboardPanelsFromConfigText(configText);
    setPanelDraftState({
      scopeKey: panelScopeKey,
      value: createDefaultDashboardPanelDraft(panels.ok ? panels.panels : [])
    });
  }

  function resetVariableDraft(configText = visibleEditForm.configText) {
    const variables = readDashboardVariablesFromConfigText(configText);
    setVariableDraftState({
      scopeKey: variableScopeKey,
      value: createDefaultDashboardVariableDraft(variables.ok ? variables.variables : [])
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

    if (activeTimeRangeDraft && !activeTimeRangeDraft.result.ok) {
      updateMutation.reset();
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: activeTimeRangeDraft.result.message });
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

  function handleVariableApply() {
    if (!selectedDashboard) {
      return;
    }

    const result = upsertDashboardVariableInConfigText(visibleEditForm.configText, activeVariableDraft);
    if (!result.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: result.message });
      return;
    }

    updateEditForm({ ...visibleEditForm, configText: result.configText });
    clearLocalEditError();
    resetVariableDraft(result.configText);
  }

  function handleTimeRangeDraftChange(draft: DashboardTimeRangeDraft) {
    if (!selectedDashboard) {
      return;
    }

    const result = writeDashboardTimeRangeToConfigText(visibleEditForm.configText, draft);
    if (!result.ok) {
      setTimeRangeDraftState({
        scopeKey: timeRangeScopeKey,
        value: {
          configText: visibleEditForm.configText,
          result: createInvalidTimeRangeDraftResult(draft, result.message)
        }
      });
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: result.message });
      return;
    }

    updateEditForm({ ...visibleEditForm, configText: result.configText });
    setTimeRangeDraftState({ scopeKey: timeRangeScopeKey, value: null });
    clearLocalEditError();
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

  function handleVariableDelete(index: number) {
    if (!selectedDashboard) {
      return;
    }

    const result = removeDashboardVariableFromConfigText(visibleEditForm.configText, index);
    if (!result.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: result.message });
      return;
    }

    updateEditForm({ ...visibleEditForm, configText: result.configText });
    clearLocalEditError();
    resetVariableDraft(result.configText);
  }

  function handlePreviewPanelSelect(panelId: string) {
    const runtimeOverrides = buildDashboardVariableRuntimeOverrides(visibleVariables, activeVariableRuntimeDraft);
    if (!runtimeOverrides.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: runtimeOverrides.message });
      return;
    }

    const nextPreviewVariables = {
      values: runtimeOverrides.values,
      signature: runtimeOverrides.signature
    };
    const shouldRefetchSelectedPreview =
      panelId === remotePreviewPanelId &&
      activePreviewVariables.signature === nextPreviewVariables.signature &&
      canRequestRemotePreview;

    setSelectedPreviewPanelState({ scopeKey: panelScopeKey, value: panelId });
    setPreviewVariablesState({ scopeKey: panelScopeKey, value: nextPreviewVariables });
    clearLocalEditError();

    if (shouldRefetchSelectedPreview) {
      void panelPreviewQuery.refetch();
    }
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
              setTimeRangeDraftState({ scopeKey: '', value: null });
              setVariableRuntimeDraftState({ scopeKey: '', value: {} });
              setPreviewVariablesState({
                scopeKey: buildDashboardPanelScopeKey(pageScopeKey, dashboard.id),
                value: createEmptyPreviewVariablesState()
              });
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
              setTimeRangeDraftState({ scopeKey: '', value: null });
              setVariableRuntimeDraftState({ scopeKey: '', value: {} });
              setPreviewVariablesState({
                scopeKey: buildDashboardPanelScopeKey(pageScopeKey, null),
                value: createEmptyPreviewVariablesState()
              });
              setDashboardOffsetState({
                scopeKey: dashboardOffsetScopeKey,
                value: Math.max(0, dashboardOffset - DASHBOARD_PAGE_LIMIT)
              });
            }}
            onNext={() => {
              updateEditForm(dashboardToEditForm(null));
              setTimeRangeDraftState({ scopeKey: '', value: null });
              setVariableRuntimeDraftState({ scopeKey: '', value: {} });
              setPreviewVariablesState({
                scopeKey: buildDashboardPanelScopeKey(pageScopeKey, null),
                value: createEmptyPreviewVariablesState()
              });
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
              onChange={(configText) => {
                updateEditForm({ ...visibleEditForm, configText });
                setTimeRangeDraftState({ scopeKey: '', value: null });
              }}
              disabled={!authState.shouldRequest || !selectedDashboard}
            />
            <DashboardTimeRangeEditor
              disabled={!authState.shouldRequest || !selectedDashboard}
              selected={Boolean(selectedDashboard)}
              result={timeRangeReadResult}
              onDraftChange={handleTimeRangeDraftChange}
            />
            <DashboardVariableEditor
              disabled={!authState.shouldRequest || !selectedDashboard}
              variableReadResult={variableReadResult}
              variables={visibleVariables}
              draft={activeVariableDraft}
              onDraftChange={updateVariableDraft}
              onNew={() => resetVariableDraft()}
              onSelect={(variable, index) => updateVariableDraft(dashboardVariableToDraft(variable, index))}
              onDelete={handleVariableDelete}
              onApply={handleVariableApply}
            />
            <DashboardPanelPreview
              authReady={authState.shouldRequest}
              selected={Boolean(selectedDashboard)}
              model={panelPreviewModel}
              variables={visibleVariables}
              runtimeDraft={activeVariableRuntimeDraft}
              selectedPreviewPanelId={remotePreviewPanelId}
              canRequestRemotePreview={canRequestRemotePreview}
              hasUnsavedDashboardConfig={hasUnsavedDashboardConfig}
              remotePreviewData={canRequestRemotePreview ? panelPreviewQuery.data : undefined}
              remotePreviewError={canRequestRemotePreview && panelPreviewQuery.isError ? panelPreviewQuery.error : null}
              remotePreviewLoading={canRequestRemotePreview && panelPreviewQuery.isLoading}
              remotePreviewFetching={canRequestRemotePreview && panelPreviewQuery.isFetching}
              onRuntimeDraftChange={updateVariableRuntimeDraft}
              onSelectPreview={handlePreviewPanelSelect}
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

function DashboardTimeRangeEditor({
  disabled,
  selected,
  result,
  onDraftChange
}: {
  disabled: boolean;
  selected: boolean;
  result: DashboardTimeRangeReadResult;
  onDraftChange: (draft: DashboardTimeRangeDraft) => void;
}) {
  const controlsDisabled = disabled || !selected || !result.editable;
  const draft = result.draft;
  const mode = draft.mode;
  const relative = isDashboardRelativeTimeRange(draft.relative) ? draft.relative : DEFAULT_DASHBOARD_TIME_RANGE_RELATIVE;

  return (
    <div className="dashboard-time-range-editor" aria-label="全局时间范围">
      <div className="dashboard-time-range-heading">
        <div>
          <strong>全局时间范围</strong>
          <span>{selected ? result.message : '从列表中选择一个 dashboard 后，可编辑 config.time_range。'}</span>
        </div>
        <StatusBadge tone={resolveDashboardTimeRangeTone(selected, result)}>
          {selected ? result.statusLabel : '未选择'}
        </StatusBadge>
      </div>

      {!selected ? (
        <div className="resource-state dashboard-time-range-state">
          <Clock size={18} aria-hidden="true" />
          <div>
            <strong>未选择 dashboard</strong>
            <span>选择已保存 dashboard 后，可读取和写回 config.time_range。</span>
          </div>
        </div>
      ) : !result.editable ? (
        <div className="resource-state resource-state--error dashboard-time-range-state" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>时间范围不可编辑</strong>
            <span>{result.message}</span>
          </div>
        </div>
      ) : (
        <>
          {!result.ok ? (
            <div className="resource-state resource-state--error dashboard-time-range-state" role="status">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <strong>time_range 配置错误</strong>
                <span>{result.message}</span>
              </div>
            </div>
          ) : null}

          <fieldset className="dashboard-time-range-modes" disabled={controlsDisabled}>
            <legend>模式</legend>
            <div className="dashboard-time-range-mode-list">
              {(['none', 'relative', 'absolute'] as const).map((nextMode) => (
                <label key={nextMode} className={mode === nextMode ? 'is-selected' : undefined}>
                  <input
                    type="radio"
                    name="dashboard-time-range-mode"
                    value={nextMode}
                    checked={mode === nextMode}
                    onChange={() => onDraftChange(createDashboardTimeRangeModeDraft(draft, nextMode))}
                  />
                  <span>{formatDashboardTimeRangeModeLabel(nextMode)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="dashboard-time-range-fields">
            <label className="field">
              <span>Relative</span>
              <select
                value={relative}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    mode: 'relative',
                    relative: event.target.value
                  })
                }
                disabled={controlsDisabled || mode !== 'relative'}
              >
                {DASHBOARD_TIME_RANGE_RELATIVES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>From ISO</span>
              <input
                value={draft.from}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    mode: 'absolute',
                    from: event.target.value
                  })
                }
                placeholder="2026-06-24T00:00:00Z"
                disabled={controlsDisabled || mode !== 'absolute'}
              />
            </label>
            <label className="field">
              <span>To ISO</span>
              <input
                value={draft.to}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    mode: 'absolute',
                    to: event.target.value
                  })
                }
                placeholder="2026-06-24T01:00:00Z"
                disabled={controlsDisabled || mode !== 'absolute'}
              />
            </label>
          </div>
        </>
      )}
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
  model,
  variables,
  runtimeDraft,
  selectedPreviewPanelId,
  canRequestRemotePreview,
  hasUnsavedDashboardConfig,
  remotePreviewData,
  remotePreviewError,
  remotePreviewLoading,
  remotePreviewFetching,
  onRuntimeDraftChange,
  onSelectPreview
}: {
  authReady: boolean;
  selected: boolean;
  model: DashboardPanelPreviewModel;
  variables: DashboardVariable[];
  runtimeDraft: DashboardVariableRuntimeDraftValues;
  selectedPreviewPanelId: string | null;
  canRequestRemotePreview: boolean;
  hasUnsavedDashboardConfig: boolean;
  remotePreviewData?: DashboardPanelPreviewResponse;
  remotePreviewError: unknown | null;
  remotePreviewLoading: boolean;
  remotePreviewFetching: boolean;
  onRuntimeDraftChange: (variableName: string, value: string) => void;
  onSelectPreview: (panelId: string) => void;
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
          {variables.length > 0 ? (
            <DashboardPanelRuntimeVariables
              variables={variables}
              runtimeDraft={runtimeDraft}
              disabled={hasUnsavedDashboardConfig}
              onRuntimeDraftChange={onRuntimeDraftChange}
            />
          ) : null}
          <ol
            className="dashboard-panel-preview-grid"
            style={{ gridTemplateColumns: `repeat(${model.columns}, minmax(0, 1fr))` }}
          >
            {model.panels.map((panel) => (
              <li key={`${panel.id}-${panel.originalIndex}`} style={{ gridColumn: panel.gridColumn }}>
                <DashboardPanelPreviewCard
                  panel={panel}
                  selectedPreviewPanelId={selectedPreviewPanelId}
                  canRequestRemotePreview={canRequestRemotePreview}
                  hasUnsavedDashboardConfig={hasUnsavedDashboardConfig}
                  remotePreviewData={remotePreviewData}
                  remotePreviewError={remotePreviewError}
                  remotePreviewLoading={remotePreviewLoading}
                  remotePreviewFetching={remotePreviewFetching}
                  onSelectPreview={onSelectPreview}
                />
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
        <span>显示当前 config panels，并可按需加载已保存 panel 的查询样例。</span>
      </div>
      <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
    </div>
  );
}

function DashboardPanelPreviewCard({
  panel,
  selectedPreviewPanelId,
  canRequestRemotePreview,
  hasUnsavedDashboardConfig,
  remotePreviewData,
  remotePreviewError,
  remotePreviewLoading,
  remotePreviewFetching,
  onSelectPreview
}: {
  panel: DashboardPanelPreviewItem;
  selectedPreviewPanelId: string | null;
  canRequestRemotePreview: boolean;
  hasUnsavedDashboardConfig: boolean;
  remotePreviewData?: DashboardPanelPreviewResponse;
  remotePreviewError: unknown | null;
  remotePreviewLoading: boolean;
  remotePreviewFetching: boolean;
  onSelectPreview: (panelId: string) => void;
}) {
  const isSelectedForRemotePreview = selectedPreviewPanelId === panel.id;
  const canRequestThisPanelPreview = canRequestRemotePreview && isSelectedForRemotePreview;
  const querySummary =
    isSelectedForRemotePreview && remotePreviewData ? summarizeDashboardPanelQuery(remotePreviewData.query) : panel.querySummary;

  return (
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
      <div className="dashboard-panel-preview-actions">
        <button
          className="text-button"
          type="button"
          onClick={() => onSelectPreview(panel.id)}
          title={
            hasUnsavedDashboardConfig
              ? '保存 config 后加载查询预览'
              : isSelectedForRemotePreview
                ? '刷新查询预览'
                : '加载查询预览'
          }
        >
          {isSelectedForRemotePreview && remotePreviewFetching ? (
            <LoaderCircle size={16} aria-hidden="true" />
          ) : (
            <RefreshCw size={16} aria-hidden="true" />
          )}
          <span>{isSelectedForRemotePreview ? '刷新预览' : '加载预览'}</span>
        </button>
      </div>
      <dl className="dashboard-panel-preview-meta">
        <div>
          <dt>Layout</dt>
          <dd>{panel.layoutLabel}</dd>
        </div>
        <div>
          <dt>Query</dt>
          <dd>{querySummary}</dd>
        </div>
      </dl>
      {isSelectedForRemotePreview ? (
        <DashboardPanelRemotePreview
          canRequest={canRequestThisPanelPreview}
          hasUnsavedDashboardConfig={hasUnsavedDashboardConfig}
          data={remotePreviewData}
          error={canRequestRemotePreview ? remotePreviewError : null}
          isLoading={canRequestRemotePreview && remotePreviewLoading}
        />
      ) : null}
    </div>
  );
}

function DashboardPanelRuntimeVariables({
  variables,
  runtimeDraft,
  disabled,
  onRuntimeDraftChange
}: {
  variables: DashboardVariable[];
  runtimeDraft: DashboardVariableRuntimeDraftValues;
  disabled: boolean;
  onRuntimeDraftChange: (variableName: string, value: string) => void;
}) {
  return (
    <div className="dashboard-panel-remote-preview" aria-label="运行时变量值">
      <div className="dashboard-panel-remote-preview-heading">
        <strong>运行时变量值</strong>
        <span>{variables.length > 0 ? `${variables.length} 个变量` : '无变量'}</span>
      </div>
      {variables.length > 0 ? (
        <div className="dashboard-variable-form">
          {variables.map((variable) => (
            <DashboardPanelRuntimeVariableField
              key={variable.name}
              variable={variable}
              value={runtimeDraft[variable.name] ?? ''}
              disabled={disabled}
              onChange={(value) => onRuntimeDraftChange(variable.name, value)}
            />
          ))}
        </div>
      ) : (
        <span className="dashboard-panel-remote-preview-empty">当前 config.variables 为空。</span>
      )}
    </div>
  );
}

function DashboardPanelRuntimeVariableField({
  variable,
  value,
  disabled,
  onChange
}: {
  variable: DashboardVariable;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const label = `运行时变量 ${variable.name}`;
  const fallbackLabel = formatDashboardVariableFallbackLabel(variable);

  if (variable.type === 'select') {
    return (
      <label className="field">
        <span>{variable.label || variable.name}</span>
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">{fallbackLabel}</option>
          {variable.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="field">
      <span>{variable.label || variable.name}</span>
      <input
        aria-label={label}
        type={variable.type === 'number' ? 'number' : 'text'}
        step={variable.type === 'number' ? 'any' : undefined}
        value={value}
        maxLength={variable.type === 'number' ? undefined : 256}
        onChange={(event) => onChange(event.target.value)}
        placeholder={fallbackLabel}
        disabled={disabled}
      />
    </label>
  );
}

function DashboardPanelRemotePreview({
  canRequest,
  hasUnsavedDashboardConfig,
  data,
  error,
  isLoading
}: {
  canRequest: boolean;
  hasUnsavedDashboardConfig: boolean;
  data?: DashboardPanelPreviewResponse;
  error: unknown | null;
  isLoading: boolean;
}) {
  if (hasUnsavedDashboardConfig) {
    return (
      <div className="dashboard-panel-remote-preview dashboard-panel-remote-preview--muted" role="status">
        <strong>保存后可查询</strong>
        <span>远程预览只读取已保存 dashboard 中的 panel。</span>
      </div>
    );
  }

  if (!canRequest && !data && !error) {
    return (
      <div className="dashboard-panel-remote-preview dashboard-panel-remote-preview--muted">
        <strong>未加载查询预览</strong>
        <span>选择已保存 panel 后加载后端样例数据。</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="dashboard-panel-remote-preview dashboard-panel-remote-preview--muted" role="status">
        <strong>正在加载查询预览</strong>
        <span>从后端读取当前保存 panel 的查询结果样例。</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-panel-remote-preview dashboard-panel-remote-preview--error" role="status">
        <strong>查询预览失败</strong>
        <span>{readErrorMessage(error, 'form')}</span>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const preview = createDashboardPanelRemotePreviewModel(data);

  return (
    <div className="dashboard-panel-remote-preview" aria-label="查询预览结果">
      <div className="dashboard-panel-remote-preview-heading">
        <strong>{preview.title}</strong>
        <span>{preview.summary}</span>
      </div>
      {preview.visualization ? <DashboardPanelRemotePreviewVisualization visualization={preview.visualization} /> : null}
      {preview.emptyMessage ? (
        <span className="dashboard-panel-remote-preview-empty">{preview.emptyMessage}</span>
      ) : (
        <dl className="dashboard-panel-remote-preview-list">
          {preview.lines.map((line, index) => (
            <div key={`${line.label}-${index}`}>
              <dt>
                {line.marker ? (
                  <span
                    className={`dashboard-panel-remote-preview-marker dashboard-panel-remote-preview-marker--${line.marker.tone}`}
                    aria-label={line.marker.ariaLabel}
                  >
                    {line.marker.label}
                  </span>
                ) : null}
                <span>{line.label}</span>
              </dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function DashboardPanelRemotePreviewVisualization({
  visualization
}: {
  visualization: DashboardPanelRemotePreviewVisualizationModel;
}) {
  if (visualization.kind === 'metrics') {
    return (
      <div className="dashboard-panel-remote-visual dashboard-panel-remote-visual--metrics" aria-label="指标聚合可视化">
        <div className="dashboard-panel-remote-visual-summary">
          <strong>{visualization.valueLabel}</strong>
          <span>{visualization.sampleCountLabel}</span>
          <span>{visualization.windowLabel}</span>
        </div>
        <svg className="dashboard-panel-remote-chart" viewBox="0 0 240 96" role="img" aria-label="指标聚合柱状预览">
          <line className="dashboard-panel-remote-chart-axis" x1="10" x2="230" y1={visualization.axisY} y2={visualization.axisY} />
          {visualization.bars.map((bar) => (
            <rect
              key={bar.id}
              className={`dashboard-panel-remote-metric-bar dashboard-panel-remote-metric-bar--${bar.tone}`}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="2"
            >
              <title>
                {bar.label} / {bar.valueLabel} / {bar.sampleCountLabel} / {bar.windowLabel}
              </title>
            </rect>
          ))}
          {visualization.sparklinePath ? (
            <path className="dashboard-panel-remote-sparkline" d={visualization.sparklinePath} />
          ) : null}
        </svg>
      </div>
    );
  }

  return (
    <div className="dashboard-panel-remote-visual dashboard-panel-remote-visual--topology" aria-label="Topology 可视化">
      <div className="dashboard-panel-remote-visual-summary">
        <strong>{visualization.nodeLabel}</strong>
        <span>{visualization.edgeLabel}</span>
      </div>
      <svg className="dashboard-panel-remote-chart" viewBox="0 0 240 112" role="img" aria-label="Topology 节点边预览">
        {visualization.edges.map((edge) => (
          <line
            key={edge.id}
            className={`dashboard-panel-remote-topology-edge dashboard-panel-remote-topology-edge--${edge.tone}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            strokeWidth={edge.strokeWidth}
          >
            <title>
              {edge.label} / {edge.callCountLabel} / {edge.errorCountLabel} / {edge.durationLabel}
            </title>
          </line>
        ))}
        {visualization.nodes.map((node) => (
          <g key={node.id} className={`dashboard-panel-remote-topology-node dashboard-panel-remote-topology-node--${node.tone}`}>
            <circle cx={node.x} cy={node.y} r={node.radius}>
              <title>
                {node.label} / {node.spanCountLabel} / {node.traceCountLabel} / {node.errorCountLabel}
              </title>
            </circle>
            <text x={node.x} y={node.y + node.radius + 12}>
              {node.chartLabel}
            </text>
          </g>
        ))}
      </svg>
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

function DashboardVariableEditor({
  disabled,
  variableReadResult,
  variables,
  draft,
  onDraftChange,
  onNew,
  onSelect,
  onDelete,
  onApply
}: {
  disabled: boolean;
  variableReadResult: DashboardVariablesReadResult;
  variables: DashboardVariable[];
  draft: DashboardVariableDraft;
  onDraftChange: (draft: DashboardVariableDraft) => void;
  onNew: () => void;
  onSelect: (variable: DashboardVariable, index: number) => void;
  onDelete: (index: number) => void;
  onApply: () => void;
}) {
  const controlsDisabled = disabled || !variableReadResult.ok;
  const optionsDisabled = controlsDisabled || draft.type !== 'select';
  const defaultInputId = useId();

  return (
    <div className="dashboard-variable-editor" aria-label="变量配置">
      <div className="dashboard-variable-heading">
        <div>
          <strong>Variables</strong>
          <span>{variableReadResult.ok ? `${variables.length} 个变量` : variableReadResult.message}</span>
        </div>
        <button className="text-button" type="button" onClick={onNew} disabled={controlsDisabled}>
          <Plus size={16} aria-hidden="true" />
          <span>新增</span>
        </button>
      </div>

      {variableReadResult.ok ? (
        variables.length > 0 ? (
          <ul className="dashboard-variable-list">
            {variables.map((variable, index) => (
              <li
                key={`${variable.name}-${index}`}
                className={draft.mode === 'edit' && draft.editIndex === index ? 'is-selected' : undefined}
              >
                <button className="dashboard-variable-list-item" type="button" onClick={() => onSelect(variable, index)} disabled={disabled}>
                  <span>
                    <strong>{variable.label || variable.name}</strong>
                    <small>
                      {variable.name} / {variable.type}
                    </small>
                    {variable.type === 'select' ? <small>{formatDashboardVariableOptions(variable.options)}</small> : null}
                  </span>
                  <code>{formatDashboardVariableDefault(variable)}</code>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onDelete(index)}
                  disabled={disabled}
                  title="删除变量"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="resource-state dashboard-variable-empty">
            <FileJson size={18} aria-hidden="true" />
            <div>
              <strong>{variableReadResult.hasVariables ? '暂无变量' : 'Legacy config'}</strong>
              <span>{variableReadResult.hasVariables ? '当前 variables 数组为空。' : '当前 config 未包含 variables，可直接新增。'}</span>
            </div>
          </div>
        )
      ) : (
        <div className="resource-state resource-state--error dashboard-variable-empty" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>变量配置不可用</strong>
            <span>{variableReadResult.message}</span>
          </div>
        </div>
      )}

      <div className="dashboard-variable-form">
        <label className="field">
          <span>Name</span>
          <input
            value={draft.name}
            maxLength={64}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            disabled={controlsDisabled}
          />
        </label>
        <label className="field">
          <span>Label</span>
          <input
            value={draft.label}
            maxLength={120}
            onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
            disabled={controlsDisabled}
          />
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={draft.type}
            onChange={(event) => {
              const type = event.target.value as DashboardVariableDraft['type'];
              onDraftChange({
                ...draft,
                type,
                hasDefault: type === 'number' && draft.defaultValue.trim().length === 0 ? false : draft.hasDefault,
                optionsText: type === 'select' ? draft.optionsText : ''
              });
            }}
            disabled={controlsDisabled}
          >
            {DASHBOARD_VARIABLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="dashboard-variable-default-heading">
            <label htmlFor={defaultInputId}>Default</label>
            <label className="dashboard-variable-default-toggle">
              <input
                type="checkbox"
                checked={draft.hasDefault}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    hasDefault: event.target.checked,
                    defaultValue: event.target.checked ? draft.defaultValue : ''
                  })
                }
                disabled={controlsDisabled}
              />
              <span>使用</span>
            </label>
          </span>
          <input
            id={defaultInputId}
            type={draft.type === 'number' ? 'number' : 'text'}
            step={draft.type === 'number' ? 'any' : undefined}
            value={draft.defaultValue}
            maxLength={draft.type === 'number' ? undefined : 256}
            onChange={(event) => onDraftChange({ ...draft, hasDefault: true, defaultValue: event.target.value })}
            disabled={controlsDisabled}
          />
        </div>
        <label className="field dashboard-variable-options-field">
          <span>Options</span>
          <textarea
            aria-label="variable options"
            value={draft.optionsText}
            maxLength={2048}
            onChange={(event) => onDraftChange({ ...draft, optionsText: event.target.value })}
            placeholder="prod, staging"
            disabled={optionsDisabled}
            spellCheck={false}
          />
          <small>select 使用逗号或换行分隔；写回时裁剪并去重。</small>
        </label>
        <button className="text-button dashboard-variable-apply" type="button" onClick={onApply} disabled={controlsDisabled}>
          <Save size={16} aria-hidden="true" />
          <span>{draft.mode === 'edit' ? '更新变量' : '添加变量'}</span>
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

function buildDashboardVariableScopeKey(pageScopeKey: string, dashboardId: number | null) {
  return JSON.stringify({ pageScopeKey, dashboardId });
}

function buildDashboardTimeRangeScopeKey(pageScopeKey: string, dashboardId: number | null) {
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

function createEmptyVariableReadResult(): DashboardVariablesReadResult {
  return {
    ok: true,
    config: {},
    variables: [],
    hasVariables: false
  };
}

function createEmptyTimeRangeReadResult(): DashboardTimeRangeReadResult {
  return {
    ok: true,
    editable: true,
    state: 'missing',
    statusLabel: '未配置',
    message: '当前 config 未包含全局时间范围。',
    draft: createDefaultDashboardTimeRangeDraft()
  };
}

function createEmptyPreviewVariablesState(): PreviewVariablesState {
  return {
    values: {},
    signature: null
  };
}

function createInvalidTimeRangeDraftResult(draft: DashboardTimeRangeDraft, message: string): DashboardTimeRangeReadResult {
  return {
    ok: false,
    editable: true,
    state: 'invalid-time-range',
    statusLabel: '配置错误',
    message,
    draft
  };
}

function createDashboardTimeRangeModeDraft(
  draft: DashboardTimeRangeDraft,
  mode: DashboardTimeRangeDraft['mode']
): DashboardTimeRangeDraft {
  if (mode === 'relative') {
    return {
      ...draft,
      mode,
      relative: isDashboardRelativeTimeRange(draft.relative) ? draft.relative : DEFAULT_DASHBOARD_TIME_RANGE_RELATIVE
    };
  }

  return {
    ...draft,
    mode
  };
}

function formatDashboardTimeRangeModeLabel(mode: DashboardTimeRangeDraft['mode']) {
  if (mode === 'relative') {
    return 'Relative';
  }

  if (mode === 'absolute') {
    return 'Absolute';
  }

  return '未配置';
}

function resolveDashboardTimeRangeTone(selected: boolean, result: DashboardTimeRangeReadResult) {
  if (!selected) {
    return 'neutral' as const;
  }

  if (!result.ok) {
    return result.editable ? ('danger' as const) : ('warning' as const);
  }

  return result.state === 'missing' ? ('neutral' as const) : ('success' as const);
}

function formatDashboardVariableDefault(variable: DashboardVariable) {
  if (!('default' in variable)) {
    return 'default -';
  }

  return `default ${variable.default}`;
}

function invalidateDashboards(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: dashboardQueryRootKey });
}

function isAuthError(error: unknown) {
  return findUnauthorizedApiError([error]) === error;
}
