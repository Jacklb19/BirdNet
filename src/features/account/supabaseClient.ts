import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncSession } from '../offline/types';

const url: unknown = import.meta.env.VITE_SUPABASE_URL;
const anonKey: unknown = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when the build has no Supabase configuration; the app then keeps working fully on the device. */
export const supabase: SupabaseClient | null = typeof url === 'string' && url && typeof anonKey === 'string' && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Only the fields the service worker needs to authenticate synchronization requests. */
export function toSyncSession(session: Session | null): SyncSession | null {
  if (!session?.expires_at) return null;
  return { userId: session.user.id, accessToken: session.access_token, expiresAt: session.expires_at };
}
