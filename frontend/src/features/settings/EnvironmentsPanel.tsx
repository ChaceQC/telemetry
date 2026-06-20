import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { createEnvironment, type Environment, type Project } from '../../api/settings';
import { FormError, SelectField, SubmitButton, TextareaField, TextField } from './FormControls';
import { ManagementPanel } from './ManagementPanel';
import { settingsQueryKeys } from './queryKeys';
import type { PanelState } from './types';
import { findName } from './utils';

type EnvironmentsPanelProps = {
  projects: Project[];
  environments: Environment[];
  panelState: PanelState;
  projectsAvailable: boolean;
};

export function EnvironmentsPanel({ projects, environments, panelState, projectsAvailable }: EnvironmentsPanelProps) {
  const queryClient = useQueryClient();
  const projectOptions = useMemo(() => projects.map((project) => ({ label: project.name, value: project.id })), [projects]);
  const [form, setForm] = useState({
    project_id: '',
    name: '',
    key: '',
    description: ''
  });

  const mutation = useMutation({
    mutationFn: createEnvironment,
    onSuccess: () => {
      setForm({ project_id: '', name: '', key: '', description: '' });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.environments });
    }
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      ...form,
      project_id: Number(form.project_id)
    });
  }

  return (
    <ManagementPanel
      title="环境"
      description="环境用于区分 dev、test、staging、prod 等部署上下文。"
      icon={Cloud}
      state={panelState}
      count={environments.length}
      emptyTitle="暂无环境"
      emptyDescription="先创建项目，再为项目补充部署环境。"
      renderList={() => (
        <ul className="resource-list">
          {environments.map((environment) => (
            <li key={environment.id}>
              <div>
                <strong>{environment.name}</strong>
                <span>{environment.project_name || findName(projects, environment.project_id) || '未关联项目名称'}</span>
              </div>
              <code>{environment.key}</code>
            </li>
          ))}
        </ul>
      )}
      form={
        <form className="resource-form" onSubmit={handleSubmit}>
          <SelectField
            label="所属项目"
            name="environment-project"
            value={form.project_id}
            onChange={(project_id) => setForm({ ...form, project_id })}
            options={projectOptions}
            placeholder={projectsAvailable ? '选择项目' : '暂无项目可选'}
            required
          />
          <TextField
            label="环境名称"
            name="environment-name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            placeholder="生产环境"
            required
          />
          <TextField
            label="环境标识"
            name="environment-key"
            value={form.key}
            onChange={(key) => setForm({ ...form, key })}
            placeholder="prod"
            required
          />
          <TextareaField
            label="描述"
            name="environment-description"
            value={form.description || ''}
            onChange={(description) => setForm({ ...form, description })}
            placeholder="环境用途或部署范围"
          />
          <FormError error={mutation.error} />
          <SubmitButton isPending={mutation.isPending} disabled={!projectsAvailable || !form.project_id}>
            创建环境
          </SubmitButton>
        </form>
      }
    />
  );
}
