import fs from 'node:fs';
import path from 'node:path';
import { E2E_SUPABASE, OUT_DIR } from '../build.config.mjs';

/**
 * Whether the build under test was made with `npm run build:e2e` (accounts pointed at the e2e Supabase project).
 * The offline specs bind a test session through the bridge, which a configured account client replaces with its own
 * (signed out) on start, so they need the plain build; the account spec needs this one. Each skips on the other.
 */
const assets = path.join(OUT_DIR, 'assets');
export const buildHasAccounts = fs.existsSync(assets) && fs.readdirSync(assets).some((file) => file.endsWith('.js')
  && fs.readFileSync(path.join(assets, file), 'utf8').includes(E2E_SUPABASE.url));
