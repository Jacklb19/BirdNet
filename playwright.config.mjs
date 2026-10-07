import { defineConfig } from '@playwright/test';

// Requires the backend repository checked out next to this one (../backend) with its .venv.
export default defineConfig({
  testDir: './e2e', timeout: 120000, workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:9014', channel: 'msedge', headless: true },
  webServer: [
    { command: '"..\\backend\\.venv\\Scripts\\python.exe" -m uvicorn tests.local_server:app --app-dir ../backend --host 127.0.0.1 --port 8000 --no-access-log', url: 'http://127.0.0.1:8000/v1/model/latest', reuseExistingServer: false, timeout: 30000 },
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9014 --strictPort', url: 'http://127.0.0.1:9014', reuseExistingServer: false, timeout: 30000 },
  ],
});
