import { useEffect, useState } from 'react';
import { config } from '../../config/env';
import type { Locale } from '../../i18n/locales';

/**
 * Description of a species for its card (ADR-17, first phase of RF-14 without a language model): the lead of its
 * Wikipedia article, shown with its source and license. The service worker keeps every summary read, so a card
 * opened once also reads offline.
 */
export interface SpeciesSummary {
  readonly text: string;
  /** Article the text comes from, linked under it. */
  readonly url: string;
  /** Language the text is written in; English when the article does not exist in the interface language. */
  readonly language: Locale;
}

/** Wikipedia's text license, shown with every summary. */
export const SUMMARY_LICENSE = 'CC BY-SA 4.0';

/** A disambiguation page lists several meanings and describes none of them. */
const DISAMBIGUATION = 'disambiguation';
const NOT_FOUND = 404;
const FALLBACK_LANGUAGE: Locale = 'en';

/** REST endpoint of the summary of `scientificName`; article titles use underscores for spaces. */
export function summaryUrl(scientificName: string, language: Locale): string {
  return `${config.summaries[language]}/${encodeURIComponent(scientificName.trim().replace(/\s+/g, '_'))}`;
}

/**
 * The text and the article of a summary response, or null when it does not describe one subject (a disambiguation
 * page, an empty extract, a link outside https).
 */
export function parseSummary(body: unknown, language: Locale): SpeciesSummary | null {
  const page = body as { type?: unknown; extract?: unknown; content_urls?: { desktop?: { page?: unknown } } } | null;
  if (!page || page.type === DISAMBIGUATION || typeof page.extract !== 'string' || !page.extract.trim()) return null;
  const link = page.content_urls?.desktop?.page;
  if (typeof link !== 'string' || !link.startsWith('https://')) return null;
  return { text: page.extract.trim(), url: link, language };
}

async function fetchIn(scientificName: string, language: Locale): Promise<SpeciesSummary | null> {
  const response = await fetch(summaryUrl(scientificName, language), { signal: AbortSignal.timeout(config.photos.requestTimeoutMs) });
  if (response.status === NOT_FOUND) return null;
  if (!response.ok) throw new Error('Summary lookup failed.');
  return parseSummary(await response.json(), language);
}

/** The interface language first, English when there is no article in it; rejects only when nothing could be asked. */
export async function fetchSpeciesSummary(scientificName: string, locale: Locale): Promise<SpeciesSummary | null> {
  const own = await fetchIn(scientificName, locale);
  if (own || locale === FALLBACK_LANGUAGE) return own;
  return fetchIn(scientificName, FALLBACK_LANGUAGE);
}

export type SummaryState =
  | { readonly status: 'loading' | 'none' | 'unavailable' }
  | { readonly status: 'loaded'; readonly summary: SpeciesSummary };

/** `none`: Wikipedia has no description; `unavailable`: it could not be reached (offline and never read before). */
export function useSpeciesSummary(scientificName: string, locale: Locale): SummaryState {
  const [state, setState] = useState<{ readonly key: string; readonly value: SummaryState } | null>(null);
  const key = `${locale}:${scientificName}`;
  useEffect(() => {
    let active = true;
    fetchSpeciesSummary(scientificName, locale)
      .then((summary) => { if (active) setState({ key, value: summary ? { status: 'loaded', summary } : { status: 'none' } }); })
      .catch(() => { if (active) setState({ key, value: { status: 'unavailable' } }); });
    return () => { active = false; };
  }, [scientificName, locale, key]);
  return state?.key === key ? state.value : { status: 'loading' };
}
