import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { createProject, type CreateProjectRequest, type Project } from '../../api/settings';
import { FormError, SubmitButton, TextareaField, TextField } from './FormControls';
import { isUnauthorizedApiError } from './authState';
import { ManagementPanel } from './ManagementPanel';
import { settingsQueryKeys } from './queryKeys';
import type { PanelState } from './types';

type ProjectsPanelProps = {
  projects: Project[];
  panelState: PanelState;
  isAuthBlocked: boolean;
  onUnauthorized: (error: unknown) => void;
};

export function ProjectsPanel({ projects, panelState, isAuthBlocked, onUnauthorized }: ProjectsPanelProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateProjectRequest>({ name: '', key: '', description: '' });

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setForm({ name: '', key: '', description: '' });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.projects });
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

    mutation.mutate(form);
  }

  return (
    <ManagementPanel
      title="项目"
      description="项目用于隔离业务线、产品或系统边界。"
      icon={FolderKanban}
      state={panelState}
      count={projects.length}
      emptyTitle="暂无项目"
      emptyDescription="创建第一个项目后，环境和服务可以绑定到该项目。"
      renderList={() => (
        <ul className="resource-list">
          {projects.map((project) => (
            <li key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <span>{project.description || '未填写描述'}</span>
              </div>
              <code>{project.key}</code>
            </li>
          ))}
        </ul>
      )}
      form={
        <form className="resource-form" onSubmit={handleSubmit}>
          <TextField
            label="项目名称"
            name="project-name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            required
          />
          <TextField
            label="项目标识"
            name="project-key"
            value={form.key}
            onChange={(key) => setForm({ ...form, key })}
            placeholder="billing-platform"
            required
          />
          <TextareaField
            label="描述"
            name="project-description"
            value={form.description || ''}
            onChange={(description) => setForm({ ...form, description })}
            placeholder="项目用途或边界"
          />
          <FormError error={formError} />
          <SubmitButton isPending={mutation.isPending} disabled={isAuthBlocked}>
            创建项目
          </SubmitButton>
        </form>
      }
    />
  );
}
