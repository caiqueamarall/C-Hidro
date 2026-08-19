/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/C-Hidro/',
  plugins: [react()],
  assetsInclude: ['**/*.kmz'],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/ana': {
        target: 'https://www.ana.gov.br/hidrowebservice',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ana/, '')
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts']
  }
});
