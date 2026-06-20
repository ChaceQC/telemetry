import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { createService, type Environment, type Project, type Service } from '../../api/settings';
import { FormError, SelectField, SubmitButton, TextareaField, TextField } from './FormControls';
import { isUnauthorizedApiError } from './authState';
import { ManagementPanel } from './ManagementPanel';
import { settingsQueryKeys } from './queryKeys';
import type { PanelState } from './types';
import { findName } from './utils';

type ServicesPanelProps = {
  projects: Project[];
  environments: Environment[];
  services: Service[];
  panelState: PanelState;
  projectsAvailable: boolean;
  isAuthBlocked: boolean;
  onUnauthorized: (error: unknown) => void;
};

export function ServicesPanel({
  projects,
  environments,
  services,
  panelState,
  projectsAvailable,
  isAuthBlocked,
  onUnauthorized
}: ServicesPanelProps) {
  const queryClient = useQueryClient();
  const projectOptions = useMemo(() => projects.map((project) => ({ label: project.name, value: project.id })), [projects]);
  const [form, setForm] = useState({
    project_id: '',
    environment_id: '',
    name: '',
    key: '',
    description: ''
  });
  const selectedProjectId = form.project_id ? Number(form.project_id) : undefined;
  const environmentOptions = useMemo(
    () =>
      environments
        .filter((environment) => environment.project_id === selectedProjectId)
        .map((environment) => ({ label: environment.name, value: environment.id })),
    [environments, selectedProjectId]
  );

  const mutation = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      setForm({ project_id: '', environment_id: '', name: '', key: '', description: '' });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.services });
    },
    onError: (error) => {
      if (isUnauthorizedApiError(error)) {
        onUnauthorized(error);
      }
    }
  });
  const formError = isUnauthorizedApiError(mutation.error) ? null : mutation.error;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isAuthBlocked) {
      return;
    }

    mutation.mutate({
      ...form,
      project_id: Number(form.project_id),
      environment_id: Number(form.environment_id)
    });
  }

  function handleProjectChange(project_id: string) {
    const selectedEnvironment = environments.find((environment) => String(environment.id) === form.environment_id);
    const shouldClearEnvironment = selectedEnvironment?.project_id !== Number(project_id);
    setForm({
      ...form,
      project_id,
      environment_id: shouldClearEnvironment ? '' : form.environment_id
    });
  }

  return (
    <ManagementPanel
      title="服务"
      description="服务是后续指标、日志、链路和事件归属的核心资产。"
      icon={Server}
      state={panelState}
      count={services.length}
      emptyTitle="暂无服务"
      emptyDescription="先准备项目和环境，再登记服务名称与标识。"
      renderList={() => (
        <ul className="resource-list">
          {services.map((service) => (
            <li key={service.id}>
              <div>
                <strong>{service.name}</strong>
                <span>
                  {service.project_name || findName(projects, service.project_id) || '未关联项目名称'}
                  {` / ${service.environment_name || findName(environments, service.environment_id) || service.environment_id}`}
                </span>
              </div>
              <code>{service.key}</code>
            </li>
          ))}
        </ul>
      )}
      form={
        <form className="resource-form" onSubmit={handleSubmit}>
          <SelectField
            label="所属项目"
            name="service-project"
            value={form.project_id}
            onChange={handleProjectChange}
            options={projectOptions}
            placeholder={projectsAvailable ? '选择项目' : '暂无项目可选'}
            required
          />
          <SelectField
            label="关联环境"
            name="service-environment"
            value={form.environment_id}
            onChange={(environment_id) => setForm({ ...form, environment_id })}
            options={environmentOptions}
            placeholder={!form.project_id ? '先选择项目' : environmentOptions.length > 0 ? '选择环境' : '当前项目暂无环境'}
            required
          />
          <TextField
            label="服务名称"
            name="service-name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            placeholder="API Gateway"
            required
          />
          <TextField
            label="服务标识"
            name="service-key"
            value={form.key}
            onChange={(key) => setForm({ ...form, key })}
            placeholder="api-gateway"
            required
          />
          <TextareaField
            label="描述"
            name="service-description"
            value={form.description || ''}
            onChange={(description) => setForm({ ...form, description })}
            placeholder="服务职责或边界"
          />
          <FormError error={formError} />
          <SubmitButton
            isPending={mutation.isPending}
            disabled={isAuthBlocked || !projectsAvailable || environmentOptions.length === 0 || !form.environment_id}
          >
            创建服务
          </SubmitButton>
        </form>
      }
    />
  );
}
