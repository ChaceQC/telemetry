import { describe, expect, it } from 'vitest';
import {
  joinApiUrl,
  normalizeApiBasePath,
  normalizePublicBasePath,
  publicBasePathToRouterBasename,
  resolveApiBaseUrl
} from './basePaths';

describe('base path config', () => {
  it('将公开基础路径归一化为 Vite base 格式', () => {
    expect(normalizePublicBasePath(undefined)).toBe('/');
    expect(normalizePublicBasePath('')).toBe('/');
    expect(normalizePublicBasePath('/')).toBe('/');
    expect(normalizePublicBasePath('xxx')).toBe('/xxx/');
    expect(normalizePublicBasePath('/xxx')).toBe('/xxx/');
    expect(normalizePublicBasePath('/xxx/')).toBe('/xxx/');
  });

  it('从公开基础路径派生 React Router basename', () => {
    expect(publicBasePathToRouterBasename('/')).toBeUndefined();
    expect(publicBasePathToRouterBasename('/xxx/')).toBe('/xxx');
    expect(publicBasePathToRouterBasename('xxx')).toBe('/xxx');
  });

  it('显式 API URL 优先于同源 API 前缀', () => {
    expect(
      resolveApiBaseUrl({
        VITE_API_BASE_URL: 'https://api.example.test/',
        VITE_API_BASE_PATH: '/xxx/api/'
      })
    ).toBe('https://api.example.test');
  });

  it('未配置显式 API URL 时使用同源 API 前缀', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: '', VITE_API_BASE_PATH: '/api/' })).toBe('/api');
    expect(resolveApiBaseUrl({ VITE_API_BASE_PATH: '/xxx/api/' })).toBe('/xxx/api');
    expect(resolveApiBaseUrl({})).toBe('');
  });

  it('归一化同源 API 前缀并稳定拼接请求路径', () => {
    expect(normalizeApiBasePath('api')).toBe('/api');
    expect(normalizeApiBasePath('/xxx/api/')).toBe('/xxx/api');
    expect(joinApiUrl('/api/', '/api/v1/projects')).toBe('/api/v1/projects');
    expect(joinApiUrl('/xxx/api/', '/api/v1/projects')).toBe('/xxx/api/v1/projects');
    expect(joinApiUrl('https://api.example.test/', 'health')).toBe('https://api.example.test/health');
  });
});
