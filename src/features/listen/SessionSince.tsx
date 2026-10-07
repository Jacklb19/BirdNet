import { formatDate, formatNumber, useI18n } from '../../i18n';
import { useElapsed } from '../../shared/useElapsed';
import { MS_PER_MINUTE } from './listenState';

/** "Since 05:12 · 24 minutes": when the session began and how long it has run, refreshed on its own. */
export function SessionSince({ startedAt }: { readonly startedAt: number }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const minutes = Math.floor(useElapsed(startedAt) / MS_PER_MINUTE);
  // Time only: the subtitle describes a running session, so the date would be noise.
  const time = formatDate(new Date(startedAt), locale, { dateStyle: undefined });
  const text = minutes > 0
    ? dict.listen.sinceFor(time, formatNumber(minutes, locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }))
    : dict.listen.since(time);
  return <>{text}</>;
}
