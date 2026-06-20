export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME || '遥测平台',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
};

function normalizeBaseUrl(value: string | undefined) {
  return (value || '').trim().replace(/\/+$/, '');
}
