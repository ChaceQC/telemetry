import { describe, expect, it, vi } from 'vitest';
import { clearIngestStatsQueryCache, ingestStatsQueryKeys, ingestStatsQueryRootKey } from './queryKeys';

describe('overview ingest stats query keys', () => {
  it('将总览摄入统计缓存按认证会话版本隔离', () => {
    expect(ingestStatsQueryKeys.overview(4)).toEqual(['ingest-stats', 'overview', 4]);
  });

  it('登出或切换账号时清理总览摄入统计缓存根 key', () => {
    const cancelQueries = vi.fn();
    const removeQueries = vi.fn();

    clearIngestStatsQueryCache({ cancelQueries, removeQueries });

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ingestStatsQueryRootKey });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: ingestStatsQueryRootKey });
  });
});
