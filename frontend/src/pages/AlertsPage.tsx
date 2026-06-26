import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  LogIn,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ALERT_SEVERITIES,
  ALERT_SIGNALS,
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  updateAlertRule,
  type AlertRule,
  type AlertRuleListParams,
  type AlertSeverity,
  type AlertSignal
} from '../api/alerts';
import { ApiClientError } from '../api/http';
import { listProjects, type Project } from '../api/settings';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';
import {
  ALERT_JSON_TEXT_MAX_LENGTH,
  alertRuleToForm,
  buildCreateAlertRulePayload,
  buildToggleAlertRulePayload,
  buildUpdateAlertRulePayload,
  createDefaultAlertRuleForm,
  normalizePositiveInteger,
  type AlertRuleFormState
} from '../features/alerts/alertRuleForm';
import { alertRuleQueryKeys, alertRuleQueryRootKey } from '../features/alerts/queryKeys';
import { findUnauthorizedApiError, resolveSettingsAuthState } from '../features/settings/authState';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { readErrorMessage } from '../features/settings/utils';

const ALERT_RULE_PAGE_LIMIT = 50;
const emptyProjects: Project[] = [];
const emptyAlertRules: AlertRule[] = [];

type FilterState = {
  projectId: string;
  severity: '' | AlertSeverity;
  signal: '' | AlertSignal;
  enabled: '' | 'true' | 'false';
};

type ScopedState<TValue> = {
  scopeKey: string;
  value: TValue;
};

export function AlertsPage() {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const shouldRequest = auth.canRequestAuthenticatedApi;
  const authScopeKey = buildAlertAuthScopeKey(auth.sessionRevision, shouldRequest);
  const [filtersState, setFiltersState] = useState<ScopedState<FilterState>>({
    scopeKey: '',
    value: createDefaultFilterState()
  });
  const [offsetState, setOffsetState] = useState<ScopedState<number>>({ scopeKey: '', value: 0 });
  const [createFormState, setCreateFormState] = useState<ScopedState<AlertRuleFormState>>(() => ({
    scopeKey: '',
    value: createDefaultAlertRuleForm()
  }));
  const [editFormState, setEditFormState] = useState<ScopedState<AlertRuleFormState>>(() => ({
    scopeKey: '',
    value: alertRuleToForm(null)
  }));
  const [activeRuleFallbackState, setActiveRuleFallbackState] = useState<ScopedState<AlertRule | null>>({
    scopeKey: '',
    value: null
  });
  const [formUnauthorizedErrorState, setFormUnauthorizedErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });
  const [localCreateErrorState, setLocalCreateErrorState] = useState<ScopedState<string | null>>({
    scopeKey: '',
    value: null
  });
  const [localEditErrorState, setLocalEditErrorState] = useState<ScopedState<string | null>>({
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
  const [toggleRemoteErrorState, setToggleRemoteErrorState] = useState<ScopedState<unknown | null>>({
    scopeKey: '',
    value: null
  });

  const scopedFilters = shouldRequest && filtersState.scopeKey === authScopeKey ? filtersState.value : createDefaultFilterState();
  const filterSeverity = scopedFilters.severity;
  const filterSignal = scopedFilters.signal;
  const filterEnabled = scopedFilters.enabled;
  const selectedProjectId = normalizePositiveInteger(scopedFilters.projectId);
  const isProjectIdInvalid = scopedFilters.projectId.trim().length > 0 && !selectedProjectId;
  const offsetScopeKey = buildAlertOffsetScopeKey(authScopeKey, scopedFilters);
  const offset = shouldRequest && offsetState.scopeKey === offsetScopeKey ? offsetState.value : 0;
  const pageScopeKey = buildAlertPageScopeKey({ authScopeKey, filters: scopedFilters, offset });
  const activeFormUnauthorizedError =
    formUnauthorizedErrorState.scopeKey === authScopeKey ? formUnauthorizedErrorState.value : null;

  const projectsQuery = useQuery({
    queryKey: settingsQueryKeys.projectList(auth.sessionRevision),
    queryFn: listProjects,
    enabled: shouldRequest,
    retry: false
  });

  const alertRuleParams: AlertRuleListParams = {
    project_id: selectedProjectId ?? undefined,
    severity: filterSeverity || undefined,
    signal: filterSignal || undefined,
    enabled: filterEnabled === '' ? undefined : filterEnabled === 'true',
    limit: ALERT_RULE_PAGE_LIMIT,
    offset
  };
  const rulesQuery = useQuery({
    queryKey: alertRuleQueryKeys.list(auth.sessionRevision, alertRuleParams),
    queryFn: () => listAlertRules(alertRuleParams),
    enabled: shouldRequest && !isProjectIdInvalid,
    retry: false
  });

  const baseUnauthorizedError = findUnauthorizedApiError([projectsQuery.error, rulesQuery.error]) ?? activeFormUnauthorizedError;
  const authState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: baseUnauthorizedError
  });
  const authNotice = resolveAlertAuthNotice(authState);
  const canUseData = authState.shouldRequest && !isProjectIdInvalid;
  const projects = authState.shouldRequest ? projectsQuery.data ?? emptyProjects : emptyProjects;
  const rules = canUseData ? rulesQuery.data?.items ?? emptyAlertRules : emptyAlertRules;
  const total = canUseData ? rulesQuery.data?.total ?? rules.length : 0;
  const selectedProject = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null;
  const createForm =
    authState.shouldRequest && createFormState.scopeKey === pageScopeKey
      ? createFormState.value
      : createDefaultAlertRuleForm(selectedProjectId ? `${selectedProjectId}` : projects[0] ? `${projects[0].id}` : '');
  const selectedRule = resolveSelectedRule({
    canUseData,
    editFormState,
    activeRuleFallbackState,
    pageScopeKey,
    rules
  });
  const editForm =
    canUseData && editFormState.scopeKey === pageScopeKey ? editFormState.value : alertRuleToForm(null);
  const localCreateError =
    authState.shouldRequest && localCreateErrorState.scopeKey === pageScopeKey ? localCreateErrorState.value : null;
  const localEditError = canUseData && localEditErrorState.scopeKey === pageScopeKey ? localEditErrorState.value : null;
  const createRemoteError =
    authState.shouldRequest && createRemoteErrorState.scopeKey === pageScopeKey ? createRemoteErrorState.value : null;
  const updateRemoteError =
    canUseData && updateRemoteErrorState.scopeKey === pageScopeKey ? updateRemoteErrorState.value : null;
  const deleteRemoteError =
    canUseData && deleteRemoteErrorState.scopeKey === pageScopeKey ? deleteRemoteErrorState.value : null;
  const toggleRemoteError =
    canUseData && toggleRemoteErrorState.scopeKey === pageScopeKey ? toggleRemoteErrorState.value : null;
  const anyLoading = authState.shouldRequest && (projectsQuery.isLoading || (!isProjectIdInvalid && rulesQuery.isLoading));
  const anyError = authState.shouldRequest && (projectsQuery.isError || (!isProjectIdInvalid && rulesQuery.isError));
  const pageStart = total > 0 ? offset + 1 : 0;
  const pageEnd = Math.min(offset + rules.length, total);
  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + rules.length < total;

  const createMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: (rule) => {
      activateRule(rule);
      setCreateFormState({
        scopeKey: buildAlertPageScopeKey({
          authScopeKey,
          filters: { ...scopedFilters, projectId: `${rule.project_id}` },
          offset: 0
        }),
        value: createDefaultAlertRuleForm(`${rule.project_id}`)
      });
      invalidateAlertRules(queryClient);
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
    mutationFn: ({ rule, payload }: { rule: AlertRule; payload: Parameters<typeof updateAlertRule>[2] }) =>
      updateAlertRule(rule.project_id, rule.id, payload),
    onSuccess: (rule) => {
      setEditFormState({ scopeKey: pageScopeKey, value: alertRuleToForm(rule) });
      setActiveRuleFallbackState({ scopeKey: pageScopeKey, value: rule });
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: null });
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      updateAlertRuleListCache(queryClient, auth.sessionRevision, alertRuleParams, rule);
      invalidateAlertRules(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ rule, enabled }: { rule: AlertRule; enabled: boolean }) =>
      updateAlertRule(rule.project_id, rule.id, buildToggleAlertRulePayload(enabled)),
    onSuccess: (rule) => {
      setToggleRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      setActiveRuleFallbackState({ scopeKey: pageScopeKey, value: rule });
      if (selectedRule?.id === rule.id) {
        setEditFormState({ scopeKey: pageScopeKey, value: alertRuleToForm(rule) });
      }
      updateAlertRuleListCache(queryClient, auth.sessionRevision, alertRuleParams, rule);
      invalidateAlertRules(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setToggleRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (rule: AlertRule) => deleteAlertRule(rule.project_id, rule.id),
    onSuccess: (_result, rule) => {
      const nextOffset = resolveOffsetAfterDeletingOne(offset, total, ALERT_RULE_PAGE_LIMIT);
      setOffsetState({ scopeKey: offsetScopeKey, value: nextOffset });
      setEditFormState({ scopeKey: '', value: alertRuleToForm(null) });
      setActiveRuleFallbackState({ scopeKey: pageScopeKey, value: null });
      setDeleteRemoteErrorState({ scopeKey: pageScopeKey, value: null });
      removeAlertRuleFromListCache(queryClient, auth.sessionRevision, alertRuleParams, rule.id);
      invalidateAlertRules(queryClient);
    },
    onError: (error) => {
      if (isAuthError(error)) {
        setFormUnauthorizedErrorState({ scopeKey: authScopeKey, value: error });
        return;
      }
      setDeleteRemoteErrorState({ scopeKey: pageScopeKey, value: error });
    }
  });

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    toggleMutation.isPending ||
    rulesQuery.isFetching;

  function updateFilters(nextFilters: FilterState) {
    setFiltersState({ scopeKey: authScopeKey, value: nextFilters });
    setOffsetState({ scopeKey: buildAlertOffsetScopeKey(authScopeKey, nextFilters), value: 0 });
    setEditFormState({ scopeKey: '', value: alertRuleToForm(null) });
    setActiveRuleFallbackState({ scopeKey: '', value: null });
  }

  function activateRule(rule: AlertRule) {
    const nextFilters = {
      projectId: `${rule.project_id}`,
      severity: '' as const,
      signal: '' as const,
      enabled: '' as const
    };
    const nextPageScopeKey = buildAlertPageScopeKey({ authScopeKey, filters: nextFilters, offset: 0 });
    setFiltersState({ scopeKey: authScopeKey, value: nextFilters });
    setOffsetState({ scopeKey: buildAlertOffsetScopeKey(authScopeKey, nextFilters), value: 0 });
    setEditFormState({ scopeKey: nextPageScopeKey, value: alertRuleToForm(rule) });
    setActiveRuleFallbackState({ scopeKey: nextPageScopeKey, value: rule });
    setLocalCreateErrorState({ scopeKey: nextPageScopeKey, value: null });
    setLocalEditErrorState({ scopeKey: nextPageScopeKey, value: null });
    setCreateRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    setUpdateRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    setDeleteRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    setToggleRemoteErrorState({ scopeKey: nextPageScopeKey, value: null });
    upsertAlertRuleListCache(
      queryClient,
      auth.sessionRevision,
      {
        project_id: rule.project_id,
        severity: undefined,
        signal: undefined,
        enabled: undefined,
        limit: ALERT_RULE_PAGE_LIMIT,
        offset: 0
      },
      rule
    );
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalCreateErrorState({ scopeKey: pageScopeKey, value: null });
    setCreateRemoteErrorState({ scopeKey: pageScopeKey, value: null });

    const payload = buildCreateAlertRulePayload(createForm);
    if (!payload.ok) {
      setLocalCreateErrorState({ scopeKey: pageScopeKey, value: payload.message });
      return;
    }

    createMutation.mutate(payload.value);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalEditErrorState({ scopeKey: pageScopeKey, value: null });
    setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });

    if (!selectedRule) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: '请先选择告警规则。' });
      return;
    }

    const payload = buildUpdateAlertRulePayload(selectedRule, editForm);
    if (!payload.ok) {
      setLocalEditErrorState({ scopeKey: pageScopeKey, value: payload.message });
      return;
    }

    updateMutation.mutate({ rule: selectedRule, payload: payload.value });
  }

  function confirmDelete(rule: AlertRule) {
    if (!globalThis.confirm(`删除告警规则「${rule.name}」？`)) {
      return;
    }

    deleteMutation.mutate(rule);
  }

  return (
    <div className="alerts-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Alerting</p>
          <h1>告警规则</h1>
          <p className="workspace-summary">按项目维护规则定义、信号类型、严重级别和评估窗口。</p>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              if (authState.shouldRequest && !isProjectIdInvalid) {
                projectsQuery.refetch();
                rulesQuery.refetch();
              }
            }}
            disabled={!authState.shouldRequest || isProjectIdInvalid}
            title={authState.shouldRequest ? '刷新告警规则' : '登录后刷新告警规则'}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge tone={resolveHeaderBadgeTone(authState.status, anyLoading, anyError || isProjectIdInvalid)}>
            {resolveHeaderBadgeLabel(authState.status, anyLoading, anyError || isProjectIdInvalid, authState.badgeLabel)}
          </StatusBadge>
        </div>
      </header>

      {authState.status !== 'ready' ? (
        <section className="settings-auth-notice" aria-live="polite">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{authNotice.title}</strong>
            <p>{authNotice.message}</p>
          </div>
          {authState.status !== 'restoring' ? (
            <Link className="text-button" to="/login" state={{ from: { pathname: location.pathname, search: location.search } }}>
              <LogIn size={16} aria-hidden="true" />
              <span>登录</span>
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="alerts-summary" aria-label="告警规则概览">
        <SummaryTile label="当前结果" value={total} detail={formatRulePageSummary(pageStart, pageEnd, total)} />
        <SummaryTile label="已启用" value={rules.filter((rule) => rule.enabled).length} detail="当前页启用规则" />
        <SummaryTile label="Critical" value={rules.filter((rule) => rule.severity === 'critical').length} detail="当前页 critical 规则" />
        <SummaryTile label="项目范围" value={selectedProjectId ? `#${selectedProjectId}` : '全部'} detail={formatProjectScope(selectedProjectId, selectedProject)} />
      </section>

      <section className="alerts-filter-panel" aria-label="告警规则筛选">
        <div className="alerts-filter-grid">
          <label className="field">
            <span>项目</span>
            <select
              aria-label="项目"
              value={scopedFilters.projectId}
              onChange={(event) => updateFilters({ ...scopedFilters, projectId: event.target.value })}
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
              aria-label="项目 ID"
              value={scopedFilters.projectId}
              onChange={(event) => updateFilters({ ...scopedFilters, projectId: event.target.value })}
              disabled={!authState.shouldRequest}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span>severity</span>
            <select
              aria-label="severity 筛选"
              value={scopedFilters.severity}
              onChange={(event) => updateFilters({ ...scopedFilters, severity: event.target.value as FilterState['severity'] })}
              disabled={!authState.shouldRequest}
            >
              <option value="">全部</option>
              {ALERT_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>signal</span>
            <select
              aria-label="signal 筛选"
              value={scopedFilters.signal}
              onChange={(event) => updateFilters({ ...scopedFilters, signal: event.target.value as FilterState['signal'] })}
              disabled={!authState.shouldRequest}
            >
              <option value="">全部</option>
              {ALERT_SIGNALS.map((signal) => (
                <option key={signal} value={signal}>
                  {signal}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>enabled</span>
            <select
              aria-label="enabled 筛选"
              value={scopedFilters.enabled}
              onChange={(event) => updateFilters({ ...scopedFilters, enabled: event.target.value as FilterState['enabled'] })}
              disabled={!authState.shouldRequest}
            >
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select>
          </label>
        </div>
        {isProjectIdInvalid ? (
          <div className="form-error" role="status">
            <ShieldAlert size={16} aria-hidden="true" />
            <span>项目 ID 无效。</span>
          </div>
        ) : null}
      </section>

      <section className="alerts-grid" aria-label="告警规则管理">
        <article className="alerts-list-panel">
          <PanelHeading title="规则列表" meta={formatRulePageSummary(pageStart, pageEnd, total)} />
          <InlineError error={rulesQuery.error} title="告警规则读取失败" visible={canUseData && rulesQuery.isError} />
          <InlineError error={toggleRemoteError} title="启停更新失败" visible={Boolean(toggleRemoteError)} />
          <InlineError error={deleteRemoteError} title="删除失败" visible={Boolean(deleteRemoteError)} />
          <AlertRuleList
            rules={rules}
            selectedRule={selectedRule}
            loading={canUseData && rulesQuery.isLoading}
            error={canUseData && rulesQuery.isError}
            disabled={!canUseData || isBusy}
            onSelect={(rule) => {
              setEditFormState({ scopeKey: pageScopeKey, value: alertRuleToForm(rule) });
              setActiveRuleFallbackState({ scopeKey: pageScopeKey, value: rule });
              setLocalEditErrorState({ scopeKey: pageScopeKey, value: null });
              setUpdateRemoteErrorState({ scopeKey: pageScopeKey, value: null });
            }}
            onToggle={(rule) => toggleMutation.mutate({ rule, enabled: !rule.enabled })}
            onDelete={confirmDelete}
          />
          <Pagination
            pageStart={pageStart}
            pageEnd={pageEnd}
            total={total}
            hasPreviousPage={hasPreviousPage}
            hasNextPage={hasNextPage}
            disabled={!canUseData || rulesQuery.isFetching}
            onPrevious={() => setOffsetState({ scopeKey: offsetScopeKey, value: Math.max(0, offset - ALERT_RULE_PAGE_LIMIT) })}
            onNext={() => setOffsetState({ scopeKey: offsetScopeKey, value: offset + ALERT_RULE_PAGE_LIMIT })}
          />
        </article>

        <article className="alerts-form-panel">
          <PanelHeading title="创建" meta="POST /api/v1/alerts/rules" />
          <AlertRuleForm
            form={createForm}
            projects={projects}
            submitLabel="创建规则"
            disabled={!authState.shouldRequest || createMutation.isPending}
            onSubmit={submitCreate}
            onChange={(form) => setCreateFormState({ scopeKey: pageScopeKey, value: form })}
          />
          <InlineFormError message={localCreateError} error={createRemoteError} />
        </article>

        <article className="alerts-form-panel">
          <PanelHeading title="编辑" meta={selectedRule ? `#${selectedRule.id} / 项目 #${selectedRule.project_id}` : '未选择规则'} />
          <AlertRuleForm
            form={editForm}
            projects={projects}
            submitLabel="保存修改"
            disabled={!selectedRule || !canUseData || updateMutation.isPending}
            onSubmit={submitEdit}
            onChange={(form) => setEditFormState({ scopeKey: pageScopeKey, value: form })}
          />
          <div className="alerts-edit-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => selectedRule && toggleMutation.mutate({ rule: selectedRule, enabled: !selectedRule.enabled })}
              disabled={!selectedRule || !canUseData || toggleMutation.isPending}
            >
              {selectedRule?.enabled ? <ToggleLeft size={16} aria-hidden="true" /> : <ToggleRight size={16} aria-hidden="true" />}
              <span>{selectedRule?.enabled ? '停用' : '启用'}</span>
            </button>
            <button
              className="text-button text-button--danger"
              type="button"
              onClick={() => selectedRule && confirmDelete(selectedRule)}
              disabled={!selectedRule || !canUseData || deleteMutation.isPending}
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>删除</span>
            </button>
          </div>
          <RuleAuditMeta rule={selectedRule} />
          <InlineFormError message={localEditError} error={updateRemoteError} />
        </article>
      </section>
    </div>
  );
}

function AlertRuleForm({
  form,
  projects,
  submitLabel,
  disabled,
  onSubmit,
  onChange
}: {
  form: AlertRuleFormState;
  projects: Project[];
  submitLabel: string;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (form: AlertRuleFormState) => void;
}) {
  return (
    <form className="alerts-rule-form" onSubmit={onSubmit}>
      <div className="alerts-form-row">
        <label className="field">
          <span>项目</span>
          <select
            aria-label={`${submitLabel}项目`}
            value={form.projectId}
            onChange={(event) => onChange({ ...form, projectId: event.target.value })}
            disabled={disabled}
          >
            <option value="">选择项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} / #{project.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>名称</span>
          <input
            aria-label={`${submitLabel}名称`}
            value={form.name}
            maxLength={100}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
      <label className="field">
        <span>描述</span>
        <textarea
          aria-label={`${submitLabel}描述`}
          value={form.description}
          maxLength={500}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          disabled={disabled}
        />
      </label>
      <div className="alerts-form-row alerts-form-row--thirds">
        <div className="field alerts-enabled-field">
          <span>enabled</span>
          <label className="alerts-enabled-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => onChange({ ...form, enabled: event.target.checked })}
              disabled={disabled}
            />
            <span>{form.enabled ? '启用' : '停用'}</span>
          </label>
        </div>
        <label className="field">
          <span>severity</span>
          <select
            aria-label={`${submitLabel}severity`}
            value={form.severity}
            onChange={(event) => onChange({ ...form, severity: event.target.value as AlertSeverity })}
            disabled={disabled}
          >
            {ALERT_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>signal</span>
          <select
            aria-label={`${submitLabel}signal`}
            value={form.signal}
            onChange={(event) => onChange({ ...form, signal: event.target.value as AlertSignal })}
            disabled={disabled}
          >
            {ALERT_SIGNALS.map((signal) => (
              <option key={signal} value={signal}>
                {signal}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field alerts-json-field">
        <span>condition JSON</span>
        <textarea
          aria-label={`${submitLabel}condition JSON`}
          value={form.conditionText}
          maxLength={ALERT_JSON_TEXT_MAX_LENGTH}
          onChange={(event) => onChange({ ...form, conditionText: event.target.value })}
          disabled={disabled}
          spellCheck={false}
        />
      </label>
      <label className="field alerts-json-field">
        <span>evaluation JSON</span>
        <textarea
          aria-label={`${submitLabel}evaluation JSON`}
          value={form.evaluationText}
          maxLength={ALERT_JSON_TEXT_MAX_LENGTH}
          onChange={(event) => onChange({ ...form, evaluationText: event.target.value })}
          disabled={disabled}
          spellCheck={false}
        />
      </label>
      <button className="primary-button" type="submit" disabled={disabled}>
        {submitLabel === '保存修改' ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        <span>{submitLabel}</span>
      </button>
    </form>
  );
}

function AlertRuleList({
  rules,
  selectedRule,
  loading,
  error,
  disabled,
  onSelect,
  onToggle,
  onDelete
}: {
  rules: AlertRule[];
  selectedRule: AlertRule | null;
  loading: boolean;
  error: boolean;
  disabled: boolean;
  onSelect: (rule: AlertRule) => void;
  onToggle: (rule: AlertRule) => void;
  onDelete: (rule: AlertRule) => void;
}) {
  if (loading) {
    return <ResourceState icon={LoaderCircle} title="正在加载告警规则" message="规则列表刷新中。" loading />;
  }

  if (error) {
    return <ResourceState icon={ShieldAlert} title="列表不可用" message="请查看上方错误并重试。" tone="error" />;
  }

  if (rules.length === 0) {
    return <ResourceState icon={BellOff} title="暂无告警规则" message="当前筛选范围没有规则。" />;
  }

  return (
    <ul className="alerts-rule-list">
      {rules.map((rule) => (
        <li key={rule.id} className={selectedRule?.id === rule.id ? 'is-selected' : undefined}>
          <button className="alerts-rule-list-item" type="button" onClick={() => onSelect(rule)} disabled={disabled}>
            <span>
              <strong>{rule.name}</strong>
              <small>
                #{rule.id} / 项目 #{rule.project_id} / {rule.signal}
              </small>
              <small>{formatDateTime(rule.updated_at)} 更新</small>
            </span>
            <span className="alerts-rule-badges">
              <StatusBadge tone={severityTone(rule.severity)}>{rule.severity}</StatusBadge>
              <StatusBadge tone={rule.enabled ? 'success' : 'neutral'}>{rule.enabled ? '启用' : '停用'}</StatusBadge>
            </span>
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => onToggle(rule)}
            disabled={disabled}
            title={rule.enabled ? '停用规则' : '启用规则'}
          >
            {rule.enabled ? <ToggleLeft size={16} aria-hidden="true" /> : <ToggleRight size={16} aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" onClick={() => onDelete(rule)} disabled={disabled} title="删除规则">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RuleAuditMeta({ rule }: { rule: AlertRule | null }) {
  if (!rule) {
    return (
      <div className="alerts-rule-meta">
        <Bell size={16} aria-hidden="true" />
        <span>未选择规则。</span>
      </div>
    );
  }

  return (
    <dl className="alerts-rule-audit">
      <div>
        <dt>created_by</dt>
        <dd>{rule.created_by_user_id}</dd>
      </div>
      <div>
        <dt>updated_by</dt>
        <dd>{rule.updated_by_user_id}</dd>
      </div>
      <div>
        <dt>created_at</dt>
        <dd>{formatDateTime(rule.created_at)}</dd>
      </div>
      <div>
        <dt>updated_at</dt>
        <dd>{formatDateTime(rule.updated_at)}</dd>
      </div>
    </dl>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="summary-item">
      <Clock size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="alerts-panel-heading">
      <div>
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
    </div>
  );
}

function InlineError({ error, title, visible }: { error: unknown; title: string; visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="resource-state resource-state--error" role="status">
      <ShieldAlert size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{readErrorMessage(error, 'page')}</span>
      </div>
    </div>
  );
}

function InlineFormError({ message, error }: { message?: string | null; error?: unknown }) {
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

function ResourceState({
  icon: Icon,
  title,
  message,
  tone,
  loading
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  tone?: 'error';
  loading?: boolean;
}) {
  return (
    <div className={`resource-state${tone === 'error' ? ' resource-state--error' : ''}${loading ? ' query-loading-state' : ''}`} role="status">
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function Pagination({
  pageStart,
  pageEnd,
  total,
  hasPreviousPage,
  hasNextPage,
  disabled,
  onPrevious,
  onNext
}: {
  pageStart: number;
  pageEnd: number;
  total: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="dashboard-pagination">
      <span>{formatRulePageSummary(pageStart, pageEnd, total)}</span>
      <div className="dashboard-pagination-actions">
        <button className="icon-button" type="button" onClick={onPrevious} disabled={disabled || !hasPreviousPage} title="上一页">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" onClick={onNext} disabled={disabled || !hasNextPage} title="下一页">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function resolveSelectedRule({
  canUseData,
  editFormState,
  activeRuleFallbackState,
  pageScopeKey,
  rules
}: {
  canUseData: boolean;
  editFormState: ScopedState<AlertRuleFormState>;
  activeRuleFallbackState: ScopedState<AlertRule | null>;
  pageScopeKey: string;
  rules: AlertRule[];
}) {
  if (!canUseData || editFormState.scopeKey !== pageScopeKey) {
    return null;
  }

  const ruleId = activeRuleFallbackState.scopeKey === pageScopeKey ? activeRuleFallbackState.value?.id : null;
  if (!ruleId) {
    return null;
  }

  return rules.find((rule) => rule.id === ruleId) ?? activeRuleFallbackState.value;
}

function createDefaultFilterState(): FilterState {
  return {
    projectId: '',
    severity: '',
    signal: '',
    enabled: ''
  };
}

function resolveHeaderBadgeTone(status: string, loading: boolean, error: boolean) {
  if (status !== 'ready') {
    return 'warning' as const;
  }

  if (loading) {
    return 'warning' as const;
  }

  return error ? ('danger' as const) : ('success' as const);
}

function resolveHeaderBadgeLabel(status: string, loading: boolean, error: boolean, fallback: string) {
  if (status !== 'ready') {
    return fallback;
  }

  if (loading) {
    return '加载中';
  }

  return error ? '部分异常' : '已同步';
}

function resolveAlertAuthNotice(authState: { status: string; title?: string; message?: string }) {
  if (authState.status === 'signed-out') {
    return {
      title: '请先登录',
      message: '登录后可以管理告警规则。'
    };
  }

  return {
    title: authState.title,
    message: authState.message
  };
}

function severityTone(severity: AlertSeverity) {
  if (severity === 'critical') {
    return 'danger' as const;
  }

  if (severity === 'warning') {
    return 'warning' as const;
  }

  return 'neutral' as const;
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function formatProjectScope(projectId: number | null, project: Project | null) {
  if (!projectId) {
    return '全部可访问项目';
  }

  if (project) {
    return `${project.name} / #${project.id}`;
  }

  return `项目 #${projectId}`;
}

function formatRulePageSummary(pageStart: number, pageEnd: number, total: number) {
  if (total === 0) {
    return `0 条结果，每页 ${ALERT_RULE_PAGE_LIMIT} 条。`;
  }

  return `第 ${pageStart}-${pageEnd} 条，共 ${total} 条。`;
}

function buildAlertAuthScopeKey(sessionRevision: number, shouldRequest: boolean) {
  return JSON.stringify({ sessionRevision, shouldRequest });
}

function buildAlertOffsetScopeKey(authScopeKey: string, filters: FilterState) {
  return JSON.stringify({ authScopeKey, filters });
}

function buildAlertPageScopeKey({
  authScopeKey,
  filters,
  offset
}: {
  authScopeKey: string;
  filters: FilterState;
  offset: number;
}) {
  return JSON.stringify({ authScopeKey, filters, offset });
}

function invalidateAlertRules(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: alertRuleQueryRootKey });
}

function upsertAlertRuleListCache(
  queryClient: QueryClient,
  sessionRevision: number,
  params: AlertRuleListParams,
  rule: AlertRule
) {
  queryClient.setQueryData<{ items: AlertRule[]; limit: number; offset: number; total: number }>(
    alertRuleQueryKeys.list(sessionRevision, params),
    (current) => {
      if (!current) {
        return {
          items: [rule],
          limit: params.limit ?? ALERT_RULE_PAGE_LIMIT,
          offset: params.offset ?? 0,
          total: 1
        };
      }

      const limit = current.limit || params.limit || ALERT_RULE_PAGE_LIMIT;
      const existed = current.items.some((item) => item.id === rule.id);
      const items = [rule, ...current.items.filter((item) => item.id !== rule.id)].slice(0, limit);
      return {
        ...current,
        items,
        total: existed ? Math.max(current.total, items.length) : Math.max(current.total + 1, items.length)
      };
    }
  );
}

function updateAlertRuleListCache(
  queryClient: QueryClient,
  sessionRevision: number,
  params: AlertRuleListParams,
  rule: AlertRule
) {
  queryClient.setQueryData<{ items: AlertRule[]; limit: number; offset: number; total: number }>(
    alertRuleQueryKeys.list(sessionRevision, params),
    (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => (item.id === rule.id ? rule : item))
      };
    }
  );
}

function removeAlertRuleFromListCache(
  queryClient: QueryClient,
  sessionRevision: number,
  params: AlertRuleListParams,
  ruleId: number
) {
  queryClient.setQueryData<{ items: AlertRule[]; limit: number; offset: number; total: number }>(
    alertRuleQueryKeys.list(sessionRevision, params),
    (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((item) => item.id !== ruleId),
        total: Math.max(0, current.total - 1)
      };
    }
  );
}

function resolveOffsetAfterDeletingOne(currentOffset: number, currentTotal: number, limit: number) {
  const nextTotal = Math.max(0, currentTotal - 1);
  const lastOffset = nextTotal > 0 ? Math.floor((nextTotal - 1) / limit) * limit : 0;

  return Math.min(currentOffset, lastOffset);
}

function isAuthError(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}
