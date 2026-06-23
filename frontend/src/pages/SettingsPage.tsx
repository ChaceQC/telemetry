import { useQuery } from '@tanstack/react-query';
import { Cloud, FolderKanban, LogIn, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listEnvironments, listProjects, listServices } from '../api/settings';
import { EnvironmentsPanel } from '../features/settings/EnvironmentsPanel';
import { ProjectsPanel } from '../features/settings/ProjectsPanel';
import { findUnauthorizedApiError, resolveSettingsAuthState } from '../features/settings/authState';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { ServicesPanel } from '../features/settings/ServicesPanel';
import { SettingsSummaryItem } from '../features/settings/SettingsSummary';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../features/auth/useAuth';

export function SettingsPage() {
  const auth = useAuth();
  const location = useLocation();
  const [formUnauthorizedError, setFormUnauthorizedError] = useState<unknown>(null);
  const shouldRequestSettings = auth.canRequestAuthenticatedApi;
  const projectsQuery = useQuery({
    queryKey: settingsQueryKeys.projects,
    queryFn: listProjects,
    enabled: shouldRequestSettings,
    retry: false
  });

  const environmentsQuery = useQuery({
    queryKey: settingsQueryKeys.environments,
    queryFn: listEnvironments,
    enabled: shouldRequestSettings,
    retry: false
  });

  const servicesQuery = useQuery({
    queryKey: settingsQueryKeys.services,
    queryFn: listServices,
    enabled: shouldRequestSettings,
    retry: false
  });

  const unauthorizedError =
    findUnauthorizedApiError([projectsQuery.error, environmentsQuery.error, servicesQuery.error]) ?? formUnauthorizedError;
  const authState = resolveSettingsAuthState({
    isAuthenticated: auth.isAuthenticated,
    isRestoring: auth.isRestoring,
    authError: unauthorizedError
  });
  const isAuthBlocked = authState.status !== 'ready';
  const projects = projectsQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const anyLoading = projectsQuery.isLoading || environmentsQuery.isLoading || servicesQuery.isLoading;
  const anyError = projectsQuery.isError || environmentsQuery.isError || servicesQuery.isError;
  const shouldShowAuthNotice = authState.status !== 'ready';

  return (
    <div className="settings-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>基础管理</h1>
          <p className="workspace-summary">
            管理项目、环境和服务目录。创建和刷新操作会使用当前登录状态访问管理接口。
          </p>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              if (authState.shouldRequest) {
                projectsQuery.refetch();
                environmentsQuery.refetch();
                servicesQuery.refetch();
              }
            }}
            disabled={!authState.shouldRequest}
            title={authState.shouldRequest ? '刷新基础管理数据' : '登录后刷新基础管理数据'}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge
            tone={
              authState.status === 'ready'
                ? anyLoading
                  ? 'warning'
                  : anyError
                    ? 'danger'
                    : 'success'
                : 'warning'
            }
          >
            {authState.status === 'ready' ? (anyLoading ? '加载中' : anyError ? '部分异常' : '已同步') : authState.badgeLabel}
          </StatusBadge>
        </div>
      </header>

      {shouldShowAuthNotice ? (
        <section className="settings-auth-notice" aria-live="polite">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{authState.title}</strong>
            <p>{authState.message}</p>
          </div>
          {authState.status !== 'restoring' ? (
            <Link className="text-button" to="/login" state={{ from: { pathname: location.pathname } }}>
              <LogIn size={16} aria-hidden="true" />
              <span>登录</span>
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="settings-summary" aria-label="基础管理概览">
        <SettingsSummaryItem icon={FolderKanban} label="项目" value={projects.length} />
        <SettingsSummaryItem icon={Cloud} label="环境" value={environments.length} />
        <SettingsSummaryItem icon={Server} label="服务" value={services.length} />
      </section>

      <section className="management-grid" aria-label="基础管理列表和创建表单">
        <ProjectsPanel
          projects={projects}
          panelState={{
            isLoading: projectsQuery.isLoading,
            isError: projectsQuery.isError,
            error: projectsQuery.error,
            isFetching: projectsQuery.isFetching,
            canRefresh: authState.shouldRequest,
            refetch: projectsQuery.refetch
          }}
          isAuthBlocked={isAuthBlocked}
          onUnauthorized={setFormUnauthorizedError}
        />
        <EnvironmentsPanel
          projects={projects}
          environments={environments}
          projectsAvailable={projects.length > 0}
          panelState={{
            isLoading: environmentsQuery.isLoading,
            isError: environmentsQuery.isError,
            error: environmentsQuery.error,
            isFetching: environmentsQuery.isFetching,
            canRefresh: authState.shouldRequest,
            refetch: environmentsQuery.refetch
          }}
          isAuthBlocked={isAuthBlocked}
          onUnauthorized={setFormUnauthorizedError}
        />
        <ServicesPanel
          projects={projects}
          environments={environments}
          services={services}
          projectsAvailable={projects.length > 0}
          panelState={{
            isLoading: servicesQuery.isLoading,
            isError: servicesQuery.isError,
            error: servicesQuery.error,
            isFetching: servicesQuery.isFetching,
            canRefresh: authState.shouldRequest,
            refetch: servicesQuery.refetch
          }}
          isAuthBlocked={isAuthBlocked}
          onUnauthorized={setFormUnauthorizedError}
        />
      </section>
    </div>
  );
}
