import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizePublicBasePath } from './src/config/basePaths';

function readPort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function readHost(value: string | undefined, fallback: string) {
  const host = value?.trim();
  return host && host.length > 0 ? host : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHost = readHost(env.VITE_DEV_HOST, '127.0.0.1');
  const previewHost = readHost(env.VITE_PREVIEW_HOST, '127.0.0.1');
  const devPort = readPort(env.VITE_DEV_PORT, 25173);
  const previewPort = readPort(env.VITE_PREVIEW_PORT, 25174);
  const publicBasePath = normalizePublicBasePath(env.VITE_PUBLIC_BASE_PATH);

  return {
    base: publicBasePath,
    plugins: [react()],
    server: {
      host: devHost,
      port: devPort,
      strictPort: true
    },
    preview: {
      host: previewHost,
      port: previewPort,
      strictPort: true
    }
  };
});
