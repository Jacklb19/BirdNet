// The production build with accounts pointed at the e2e Supabase project, so the e2e specs can sign in without a
// real account: Trino opens only with one (ADR-45). Run before `npm run test:offline`.
import { spawnSync } from 'node:child_process';
import { E2E_SUPABASE } from '../build.config.mjs';

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_SUPABASE_URL: E2E_SUPABASE.url, VITE_SUPABASE_ANON_KEY: E2E_SUPABASE.anonKey },
});
process.exit(result.status ?? 1);
