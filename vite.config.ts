import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { app: resolve('index.html'), 'service-worker': resolve('src/features/offline/service-worker.ts') },
      output: { entryFileNames: (chunk) => chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js' },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', rewrite: (path) => path.replace(/^\/api/, '') } },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
