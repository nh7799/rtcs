import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './server/api.mjs';

export default defineConfig({
  plugins: [react(), localApi()],
  optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true, cors: false,
    watch: { ignored: ['**/.initio-toolchain/**', '**/.initio-pi-os/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.initio-toolchain/**', '**/.initio-pi-os/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, cors: false }
});
