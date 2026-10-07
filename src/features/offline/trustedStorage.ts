import { config } from '../../config/env';
import { SECURE_PROTOCOL } from './offline.constants';

/**
 * Whether model files may be downloaded from, or audio uploaded to, `url`. Only two origins qualify: the app's
 * own origin, and the exact origin of the configured Supabase project over https, which issues the signed
 * Storage URLs. Works in the page and in the service worker (`self.location`).
 */
export function isTrustedStorageUrl(url: URL): boolean {
  if (url.origin === self.location.origin) return true;
  if (!config.supabase || url.protocol !== SECURE_PROTOCOL) return false;
  const project = new URL(config.supabase.url, self.location.origin);
  return project.protocol === SECURE_PROTOCOL && url.origin === project.origin;
}
