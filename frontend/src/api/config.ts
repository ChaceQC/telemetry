import { normalizePublicBasePath, publicBasePathToRouterBasename, resolveApiBaseUrl } from '../config/basePaths';

export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME || '遥测平台',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
  publicBasePath: normalizePublicBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH),
  routerBasename: publicBasePathToRouterBasename(import.meta.env.VITE_PUBLIC_BASE_PATH),
  apiBaseUrl: resolveApiBaseUrl(import.meta.env)
};
