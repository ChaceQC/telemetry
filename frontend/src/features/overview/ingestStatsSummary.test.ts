import { describe, expect, it } from 'vitest';
import { formatBytes, summarizeIngestStats } from './ingestStatsSummary';
import type { IngestStatItem } from '../../api/ingestStats';

const baseStat = {
  bucket_start: '2026-06-20T10:00:00Z',
  project_id: 1,
  api_key_id: 2,
  source: 'api',
  accepted_count: 0,
  rejected_count: 0,
  bytes_count: 0
} satisfies Omit<IngestStatItem, 'kind'>;

describe('ingest stats summary', () => {
  it('按信号类型汇总 accepted/rejected/bytes/source 和最近时间', () => {
    const summaries = summarizeIngestStats([
      { ...baseStat, kind: 'metric', accepted_count: 12, rejected_count: 1, bytes_count: 2048 },
      {
        ...baseStat,
        kind: 'metric',
        source: 'worker',
        bucket_start: '2026-06-20T10:05:00Z',
        accepted_count: 3,
        rejected_count: 2,
        bytes_count: 512
      },
      { ...baseStat, kind: 'log', accepted_count: 8, bytes_count: 128 }
    ]);

    expect(summaries).toEqual([
      {
        kind: 'metric',
        label: 'Metrics',
        acceptedCount: 15,
        rejectedCount: 3,
        bytesCount: 2560,
        sourceCount: 2,
        latestBucketStart: '2026-06-20T10:05:00Z'
      },
      {
        kind: 'log',
        label: 'Logs',
        acceptedCount: 8,
        rejectedCount: 0,
        bytesCount: 128,
        sourceCount: 1,
        latestBucketStart: '2026-06-20T10:00:00Z'
      },
      {
        kind: 'event',
        label: 'Events',
        acceptedCount: 0,
        rejectedCount: 0,
        bytesCount: 0,
        sourceCount: 0,
        latestBucketStart: null
      }
    ]);
  });

  it('格式化字节数', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
