/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_PUBLIC_BASE_PATH?: string;
  readonly VITE_API_BASE_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_HOST?: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_PREVIEW_HOST?: string;
  readonly VITE_PREVIEW_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
