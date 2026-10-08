import { API_ROUTES, apiFetch } from '../../config/api';
import { AVATAR_UPLOAD, avatarObjectPath, FIELD_LIMITS } from '../../config/contract';
import { config } from '../../config/env';
import { deviceTimeZone, isCount, isProbability, isTimestamp } from '../../shared/apiValues';
import { JSON_HEADERS } from '../offline/offline.constants';
import { isTrustedStorageUrl } from '../offline/trustedStorage';

/** The caller's public face in the app (ADR-21): an alias and an optional photo, never shown on the shared map. */
export interface Profile {
  readonly alias: string | null;
  /** Short-lived signed URL of the photo, or null. */
  readonly avatarUrl: string | null;
}

/** Totals over the caller's own detections, discarded ones excluded. */
export interface AccountSummary {
  readonly detections: number;
  readonly species: number;
  readonly sites: number;
  readonly activeDays: number;
  readonly firstRecordedAt: string | null;
  readonly lastRecordedAt: string | null;
}

export interface OwnSpecies {
  readonly species: string;
  readonly detections: number;
  readonly bestConfidence: number;
  readonly firstRecordedAt: string;
  readonly lastRecordedAt: string;
  readonly sites: number;
}

const isOptionalTimestamp = (value: unknown): value is string | null => value === null || isTimestamp(value);

export function parseProfile(body: unknown): Profile {
  const row = body as Record<string, unknown> | null;
  if (!row || (row.alias !== null && typeof row.alias !== 'string') || (row.avatar_url !== null && typeof row.avatar_url !== 'string')) {
    throw new Error('Invalid profile.');
  }
  let avatarUrl: string | null = null;
  if (typeof row.avatar_url === 'string') {
    // Only a signed URL of the configured project is shown; anything else is dropped rather than loaded.
    try { avatarUrl = isTrustedStorageUrl(new URL(row.avatar_url)) ? row.avatar_url : null; } catch { avatarUrl = null; }
  }
  return { alias: row.alias, avatarUrl };
}

export function parseSummary(body: unknown): AccountSummary {
  const row = body as Record<string, unknown> | null;
  if (!row || !isCount(row.detections) || !isCount(row.species) || !isCount(row.sites) || !isCount(row.active_days) ||
      !isOptionalTimestamp(row.first_recorded_at) || !isOptionalTimestamp(row.last_recorded_at)) throw new Error('Invalid summary.');
  return {
    detections: row.detections, species: row.species, sites: row.sites, activeDays: row.active_days,
    firstRecordedAt: row.first_recorded_at, lastRecordedAt: row.last_recorded_at,
  };
}

function toOwnSpecies(value: unknown): OwnSpecies | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.species !== 'string' || !row.species || !isCount(row.detections) || !isProbability(row.best_confidence) ||
      !isTimestamp(row.first_recorded_at) || !isTimestamp(row.last_recorded_at) || !isCount(row.sites)) return null;
  return {
    species: row.species, detections: row.detections, bestConfidence: row.best_confidence,
    firstRecordedAt: row.first_recorded_at, lastRecordedAt: row.last_recorded_at, sites: row.sites,
  };
}

/** A malformed row is left out instead of hiding the whole album. */
export function parseOwnSpecies(body: unknown): OwnSpecies[] {
  const list = (body as { species?: unknown } | null)?.species;
  if (!Array.isArray(list)) throw new Error('Invalid species list.');
  return list.map(toOwnSpecies).filter((row): row is OwnSpecies => row !== null);
}

export async function fetchProfile(token: string): Promise<Profile> {
  return parseProfile(await (await apiFetch(API_ROUTES.me, { token })).json());
}

/** A blank alias clears it; the server applies the same limit. */
export function normalizeAlias(alias: string): string | null {
  const trimmed = alias.trim();
  if (trimmed.length > FIELD_LIMITS.alias) throw new Error('Alias too long.');
  return trimmed || null;
}

export async function updateProfile(token: string, changes: { readonly alias?: string | null; readonly avatar_path?: string | null }): Promise<Profile> {
  const response = await apiFetch(API_ROUTES.me, { token, method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(changes) });
  return parseProfile(await response.json());
}

export async function fetchSummary(token: string): Promise<AccountSummary> {
  const params = new URLSearchParams({ tz: deviceTimeZone(config.defaultTimeZone) });
  return parseSummary(await (await apiFetch(API_ROUTES.meSummary, { token, params })).json());
}

export async function fetchOwnSpecies(token: string): Promise<OwnSpecies[]> {
  return parseOwnSpecies(await (await apiFetch(API_ROUTES.meSpecies, { token })).json());
}

/**
 * Square-crops and scales a chosen picture to the avatar size and encodes it as WebP, so only a small file leaves
 * the phone. Throws when the browser cannot encode WebP or the result is still too large.
 */
export async function encodeAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_UPLOAD.sidePx;
    canvas.height = AVATAR_UPLOAD.sidePx;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_UPLOAD.sidePx, AVATAR_UPLOAD.sidePx);
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, AVATAR_UPLOAD.mimeType, AVATAR_UPLOAD.quality); });
    if (blob?.type !== AVATAR_UPLOAD.mimeType || blob.size > AVATAR_UPLOAD.maxBytes) throw new Error('Avatar could not be encoded.');
    return blob;
  } finally { bitmap.close(); }
}

/** Uploads through a signed Storage URL (the API token never travels to Storage) and records the path on the profile. */
export async function uploadAvatar(token: string, userId: string, image: Blob): Promise<Profile> {
  const signed = await apiFetch(API_ROUTES.meAvatarUrl, {
    token, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ content_type: AVATAR_UPLOAD.mimeType, size_bytes: image.size }),
  });
  const result = await signed.json() as { upload_url?: unknown; avatar_path?: unknown } | null;
  const expectedPath = avatarObjectPath(userId);
  if (typeof result?.upload_url !== 'string' || result.avatar_path !== expectedPath) throw new Error('Invalid upload authorization.');
  const uploadUrl = new URL(result.upload_url, window.location.origin);
  if (!isTrustedStorageUrl(uploadUrl)) throw new Error('Untrusted upload origin.');
  const upload = await fetch(uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': AVATAR_UPLOAD.mimeType, 'x-upsert': 'true' }, body: image,
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (!upload.ok) throw new Error('Avatar upload failed.');
  return updateProfile(token, { avatar_path: expectedPath });
}
