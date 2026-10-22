import { ApiError, API_ROUTES, apiFetch, apiUrl, WRITING_TIMEOUT_MS } from '../../config/api';
import { isTimestamp } from '../../shared/apiValues';
import type { Locale } from '../../i18n/locales';
import { WRITTEN_CARD_CACHE_NAME } from './species.config';

/**
 * Card of a species written by the language model from public sources only (RF-14, ADR-37): the API gathers GBIF and
 * Wikipedia itself, so the app only names the species. Cards are shared by everyone; reading one needs no account,
 * writing one does and counts against the person's texts of the day. A card once read is kept on the phone.
 */
export interface WrittenCard {
  readonly paragraphs: readonly string[];
  readonly sources: readonly { readonly name: string; readonly url: string; readonly license: string }[];
  readonly generatedAt: string;
  /** Old, or written by another model or instructions: the API writes it again when someone asks. */
  readonly stale: boolean;
}

/** Why a card could not be written; the API answers each with its own status. */
export type CardFailure = 'unknownSpecies' | 'quota' | 'unavailable';

const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const TOO_MANY = 429;

function isSource(value: unknown): value is WrittenCard['sources'][number] {
  const row = value as Record<string, unknown> | null;
  return !!row && typeof row.name === 'string' && typeof row.license === 'string' && typeof row.url === 'string' && row.url.startsWith('https://');
}

/** Every field the card shows; a malformed answer is never drawn. */
export function parseWrittenCard(body: unknown): WrittenCard {
  const row = body as Record<string, unknown> | null;
  if (!row || !Array.isArray(row.paragraphs) || row.paragraphs.length === 0 || !row.paragraphs.every((p) => typeof p === 'string' && p.trim()) ||
      !Array.isArray(row.sources) || !row.sources.every(isSource) || !isTimestamp(row.generated_at) || typeof row.stale !== 'boolean') {
    throw new Error('Invalid species card.');
  }
  return { paragraphs: row.paragraphs as string[], sources: row.sources, generatedAt: row.generated_at, stale: row.stale };
}

export function failureOf(error: unknown): CardFailure {
  if (error instanceof ApiError && error.status === UNPROCESSABLE) return 'unknownSpecies';
  if (error instanceof ApiError && error.status === TOO_MANY) return 'quota';
  return 'unavailable';
}

function cardKey(species: string, locale: Locale): string {
  return apiUrl(API_ROUTES.speciesCard(species), new URLSearchParams({ locale }));
}

async function remember(species: string, locale: Locale, card: WrittenCard): Promise<void> {
  try {
    await (await caches.open(WRITTEN_CARD_CACHE_NAME)).put(cardKey(species, locale), new Response(JSON.stringify(card)));
  } catch {
    // Without Cache Storage the card simply needs the network next time.
  }
}

async function remembered(species: string, locale: Locale): Promise<WrittenCard | null> {
  try {
    const cached = await (await caches.open(WRITTEN_CARD_CACHE_NAME)).match(cardKey(species, locale));
    return cached ? await cached.json() as WrittenCard : null;
  } catch {
    return null;
  }
}

/** The stored card, or null when none was written yet; offline, the copy kept on the phone (or a rejection). */
export async function fetchWrittenCard(species: string, locale: Locale): Promise<WrittenCard | null> {
  try {
    const response = await apiFetch(API_ROUTES.speciesCard(species), { params: new URLSearchParams({ locale }) });
    const card = parseWrittenCard(await response.json());
    await remember(species, locale, card);
    return card;
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) return null;
    const kept = await remembered(species, locale);
    if (kept) return kept;
    throw error;
  }
}

/** Asks the API to write the card (or returns the one already written while it is fresh). */
export async function writeCard(token: string, species: string, locale: Locale): Promise<WrittenCard> {
  const response = await apiFetch(API_ROUTES.speciesCard(species), { token, method: 'POST', params: new URLSearchParams({ locale }), timeoutMs: WRITING_TIMEOUT_MS });
  const card = parseWrittenCard(await response.json());
  await remember(species, locale, card);
  return card;
}
