import { describe, expect, it, vi } from 'vitest';
import { clearSettingsQueryCache, settingsQueryKeys, settingsQueryRootKey } from './queryKeys';

describe('settings query keys', () => {
  it('将 Settings 列表缓存按认证会话版本隔离', () => {
    expect(settingsQueryKeys.projectList(4)).toEqual(['settings', 'projects', 4]);
    expect(settingsQueryKeys.environmentList(4)).toEqual(['settings', 'environments', 4]);
    expect(settingsQueryKeys.serviceList(4)).toEqual(['settings', 'services', 4]);
  });

  it('登出或切换账号时清理 Settings 缓存根 key', () => {
    const cancelQueries = vi.fn();
    const removeQueries = vi.fn();

    clearSettingsQueryCache({ cancelQueries, removeQueries });

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: settingsQueryRootKey });
    expect(removeQueries).toHaveBeenCalledWith({ queryKey: settingsQueryRootKey });
  });
});
