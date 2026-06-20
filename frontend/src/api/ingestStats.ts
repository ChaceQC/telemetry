import { apiRequest } from './http';
import { buildQueryPath } from './queryParams';

export type IngestKind = 'event' | 'metric' | 'log';

export type IngestStatsParams = {
  project_id?: number;
  kind?: IngestKind;
  limit?: number;
};

export type IngestStatItem = {
  bucket_start: string;
  project_id: number;
  api_key_id: number;
  kind: IngestKind;
  source: string | null;
  accepted_count: number;
  rejected_count: number;
  bytes_count: number;
};

export function listIngestStats(params: IngestStatsParams = {}) {
  return apiRequest<IngestStatItem[]>(buildQueryPath('/api/v1/ingest/stats', params));
}
