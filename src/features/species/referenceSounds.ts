import { API_ROUTES, apiFetch } from '../../config/api';

/**
 * Reference recordings of a species from xeno-canto (ADR-42). The API keeps xeno-canto's key and returns only what its
 * terms ask to show with each recording; the audio itself comes from xeno-canto when the person presses play.
 */
export interface ReferenceSound {
  readonly id: string;
  readonly type: string;
  readonly lengthSeconds: number;
  readonly country: string | null;
  readonly recordist: string;
  readonly license: { readonly code: string; readonly url: string };
  readonly pageUrl: string;
  readonly audioUrl: string;
}

export interface ReferenceSounds {
  /** xeno-canto withholds this species' recordings because it is vulnerable to capture. */
  readonly restricted: boolean;
  readonly sounds: readonly ReferenceSound[];
}

/** Only xeno-canto's own pages and files are opened or played, whatever an answer says. */
const XENO_CANTO_ORIGIN = 'https://xeno-canto.org';
const LICENSE_ORIGIN = 'https://creativecommons.org';

function isUrlOf(value: unknown, origin: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function parseSound(value: unknown): ReferenceSound | null {
  const row = value as Record<string, unknown> | null;
  const license = row?.license as Record<string, unknown> | null | undefined;
  if (!row || typeof row.id !== 'string' || typeof row.type !== 'string' || typeof row.recordist !== 'string' || !row.recordist.trim()
      || typeof row.length_seconds !== 'number' || !(row.length_seconds > 0) || (row.country !== null && typeof row.country !== 'string')
      || !license || typeof license.code !== 'string' || !isUrlOf(license.url, LICENSE_ORIGIN)
      || !isUrlOf(row.page_url, XENO_CANTO_ORIGIN) || !isUrlOf(row.audio_url, XENO_CANTO_ORIGIN)) {
    return null;
  }
  return {
    id: row.id, type: row.type, lengthSeconds: row.length_seconds, country: row.country, recordist: row.recordist,
    license: { code: license.code, url: license.url }, pageUrl: row.page_url, audioUrl: row.audio_url,
  };
}

/** A malformed recording is left out; an answer that is not one at all is an error. */
export function parseReferenceSounds(body: unknown): ReferenceSounds {
  const row = body as Record<string, unknown> | null;
  if (!row || typeof row.restricted !== 'boolean' || !Array.isArray(row.sounds)) throw new Error('Invalid reference sounds.');
  return { restricted: row.restricted, sounds: row.sounds.map(parseSound).filter((sound): sound is ReferenceSound => sound !== null) };
}

/** Sent without the session: the route is public and Vercel's CDN keeps one answer per species for everyone. */
export async function fetchReferenceSounds(species: string): Promise<ReferenceSounds> {
  const response = await apiFetch(API_ROUTES.speciesSounds(species));
  return parseReferenceSounds(await response.json());
}

/** Kind of sound for its label: xeno-canto's free text ("song", "call, alarm call", "flight call"…) reduced to three. */
export function soundKind(type: string): 'song' | 'call' | 'other' {
  if (/\bsong\b/.test(type)) return 'song';
  if (/\bcall\b/.test(type)) return 'call';
  return 'other';
}
