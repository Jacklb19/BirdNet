import type { Period } from '../../config/contract';
import { formatCount, formatDate, type Messages } from '../../i18n';
import type { Locale } from '../../i18n/locales';
import { peakHour } from './chorus';
import type { SiteStats } from './sitesApi';
import { atLocalHour, formatSigned, type SpeciesChange } from './siteText';

type SitesTexts = Messages['sites'];

/**
 * Busiest local hour in the locale's own clock (hours were grouped in the device's time zone). The text has no final
 * period because some clocks already end in one ("6:00 a. m.").
 */
export function peakSentence(stats: SiteStats, t: SitesTexts, locale: Locale): string {
  const hour = peakHour(stats.hourly);
  if (hour === null) return t.noPeak;
  return t.peak(formatDate(atLocalHour(new Date(stats.until), hour), locale, { dateStyle: undefined, timeStyle: 'short' }));
}

/** Text alternative of the chorus clock: species heard, period and peak hour. */
export function chartDescription(stats: SiteStats, period: Period, t: SitesTexts, locale: Locale): string {
  return t.chartDescription(formatCount(t.speciesCount, stats.species_count, locale), t.span[period], peakSentence(stats, t, locale));
}

/** Short change on a site card, as in the design ("+3 este mes"); null when there is nothing to compare with. */
export function cardChangeText(change: SpeciesChange, period: Period, t: SitesTexts, locale: Locale): string | null {
  if (change.kind === 'unknown') return null;
  return change.kind === 'same' ? t.noChange : t.cardChange[period](formatSigned(change.delta, locale));
}

/** The same change in full for screen readers, which cannot rely on the photos and the clock around it. */
export function spokenChangeText(change: SpeciesChange, period: Period, t: SitesTexts, locale: Locale): string | null {
  if (change.kind === 'unknown') return null;
  const previous = t.previousSpan[period];
  if (change.kind === 'same') return t.sameSpoken(previous);
  const amount = formatCount(change.delta > 0 ? t.moreSpecies : t.fewerSpecies, Math.abs(change.delta), locale);
  return t.changeSpoken(amount, previous);
}
