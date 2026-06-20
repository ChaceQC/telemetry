import { apiRequest } from './http';

export type Project = {
  id: number;
  name: string;
  key: string;
  description?: string | null;
  status?: 'active' | 'inactive' | 'archived';
  created_at?: string;
  updated_at?: string;
};

export type Environment = {
  id: number;
  project_id: number;
  project_name?: string | null;
  name: string;
  key: string;
  description?: string | null;
  status?: 'active' | 'inactive' | 'archived';
  created_at?: string;
  updated_at?: string;
};

export type Service = {
  id: number;
  project_id: number;
  project_name?: string | null;
  environment_id: number;
  environment_name?: string | null;
  name: string;
  key: string;
  description?: string | null;
  status?: 'active' | 'inactive' | 'archived';
  created_at?: string;
  updated_at?: string;
};

export type CreateProjectRequest = {
  name: string;
  key: string;
  description?: string;
};

export type CreateEnvironmentRequest = {
  project_id: number;
  name: string;
  key: string;
  description?: string;
};

export type CreateServiceRequest = {
  project_id: number;
  environment_id: number;
  name: string;
  key: string;
  description?: string;
};

type ListResponse<TItem> =
  | TItem[]
  | {
      items?: TItem[];
      data?: TItem[];
      results?: TItem[];
      total?: number;
      page?: number;
      page_size?: number;
    };

export function listProjects() {
  return apiRequest<ListResponse<Project>>('/api/v1/projects').then(normalizeList);
}

export function createProject(payload: CreateProjectRequest) {
  return apiRequest<Project>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(cleanPayload(payload))
  });
}

export function listEnvironments() {
  return apiRequest<ListResponse<Environment>>('/api/v1/environments').then(normalizeList);
}

export function createEnvironment(payload: CreateEnvironmentRequest) {
  return apiRequest<Environment>('/api/v1/environments', {
    method: 'POST',
    body: JSON.stringify(cleanPayload(payload))
  });
}

export function listServices() {
  return apiRequest<ListResponse<Service>>('/api/v1/services').then(normalizeList);
}

export function createService(payload: CreateServiceRequest) {
  return apiRequest<Service>('/api/v1/services', {
    method: 'POST',
    body: JSON.stringify(cleanPayload(payload))
  });
}

function normalizeList<TItem>(response: ListResponse<TItem>): TItem[] {
  if (Array.isArray(response)) {
    return response;
  }

  return response.items ?? response.data ?? response.results ?? [];
}

function cleanPayload<TPayload extends Record<string, unknown>>(payload: TPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      return value !== undefined && value !== null && `${value}`.trim().length > 0;
    })
  );
}
