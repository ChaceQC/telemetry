import { apiRequest } from './http';

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
  environment: string;
  port: number;
};

export function getHealth() {
  return apiRequest<HealthResponse>('/health');
}
