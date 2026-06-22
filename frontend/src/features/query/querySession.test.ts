import { describe, expect, it, vi } from 'vitest';
import {
  buildLogContextQueryKey,
  buildSignalQueryKey,
  clearTelemetryQueryCache,
  resolveVisibleQueryData,
  shouldRenderLogContextPanel,
  telemetryQueryRootKey
} from './querySession';

describe('query session guards', () => {
  it('将查询缓存按认证会话版本隔离', () => {
    const params = { level: 'error', limit: 50 };

    expect(buildSignalQueryKey(3, 'logs', params, 7)).toEqual(['query', 3, 'logs', params, 7]);
    expect(buildLogContextQueryKey(3, 42, 5, 2)).toEqual(['query', 3, 'logs', 'context', 42, 5, 2]);
  });

  it('无查询权限时不暴露 React Query 旧缓存数据', () => {
    const cachedData = {
      items: [{ id: 42, message: 'old context' }],
      next_cursor: null
    };

    expect(resolveVisibleQueryData(false, cachedData)).toBeUndefined();
    expect(resolveVisibleQueryData(true, cachedData)).toBe(cachedData);
  });

  it('日志上下文即使保持展开状态，也会在无权限时卸载', () => {
    expect(shouldRenderLogContextPanel(false, true)).toBe(false);
    expect(shouldRenderLogContextPanel(false, false)).toBe(false);
    expect(shouldRenderLogContextPanel(true, false)).toBe(false);
    expect(shouldRenderLogContextPanel(true, true)).toBe(true);
  });

  it('登出或切换账号时清理遥测查询缓存根 key', () => {
    const cancelQueries = vi.fn();
    const removeQueries = vi.fn();

    clearTelemetryQueryCache({ cancelQueries, removeQueries });

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: telemetryQueryRootKey });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: telemetryQueryRootKey });
  });
});
