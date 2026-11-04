import fs from 'node:fs';
import path from 'node:path';
import { E2E_SUPABASE, OUT_DIR } from '../build.config.mjs';

/**
 * Whether the build under test was made with `npm run build:e2e` (accounts pointed at the e2e Supabase project).
 * Trino opens only with an account (ADR-45), so every e2e spec needs it; a build without accounts shows only the
 * home page, the guide and the way in, and the specs skip on it, saying so.
 */
const assets = path.join(OUT_DIR, 'assets');
export const buildHasAccounts = fs.existsSync(assets) && fs.readdirSync(assets).some((file) => file.endsWith('.js')
  && fs.readFileSync(path.join(assets, file), 'utf8').includes(E2E_SUPABASE.url));
