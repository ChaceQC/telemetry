import { useQuery } from '@tanstack/react-query';
import { Cloud, FolderKanban, RefreshCw, Server } from 'lucide-react';
import { listEnvironments, listProjects, listServices } from '../api/settings';
import { EnvironmentsPanel } from '../features/settings/EnvironmentsPanel';
import { ProjectsPanel } from '../features/settings/ProjectsPanel';
import { settingsQueryKeys } from '../features/settings/queryKeys';
import { ServicesPanel } from '../features/settings/ServicesPanel';
import { SettingsSummaryItem } from '../features/settings/SettingsSummary';
import { StatusBadge } from '../components/StatusBadge';

export function SettingsPage() {
  const projectsQuery = useQuery({
    queryKey: settingsQueryKeys.projects,
    queryFn: listProjects,
    retry: false
  });

  const environmentsQuery = useQuery({
    queryKey: settingsQueryKeys.environments,
    queryFn: listEnvironments,
    retry: false
  });

  const servicesQuery = useQuery({
    queryKey: settingsQueryKeys.services,
    queryFn: listServices,
    retry: false
  });

  const projects = projectsQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const anyLoading = projectsQuery.isLoading || environmentsQuery.isLoading || servicesQuery.isLoading;
  const anyError = projectsQuery.isError || environmentsQuery.isError || servicesQuery.isError;

  return (
    <div className="settings-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>基础管理</h1>
          <p className="workspace-summary">
            管理项目、环境和服务目录。接口未就绪时页面会展示错误状态，并保留表单结构用于后续联调。
          </p>
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              projectsQuery.refetch();
              environmentsQuery.refetch();
              servicesQuery.refetch();
            }}
            title="刷新基础管理数据"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <StatusBadge tone={anyLoading ? 'warning' : anyError ? 'danger' : 'success'}>
            {anyLoading ? '加载中' : anyError ? '部分异常' : '已同步'}
          </StatusBadge>
        </div>
      </header>

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
            refetch: projectsQuery.refetch
          }}
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
            refetch: environmentsQuery.refetch
          }}
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
            refetch: servicesQuery.refetch
          }}
        />
      </section>
    </div>
  );
}
