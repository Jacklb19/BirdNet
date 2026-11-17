import { formatDistance, formatNumber, useI18n } from '../../i18n';
import { MAP_ENCOUNTERS } from './map.config';

/** The grouping rule is available beside both maps, including without a network connection. */
export function EncounterNote(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.map.encounters;
  return (
    <div className="bn-map-sheet__note">
      <p>{t.caveat}</p>
      <details>
        <summary>{t.how}</summary>
        <p>{t.rule(formatDistance(MAP_ENCOUNTERS.radiusMeters, locale), formatNumber(MAP_ENCOUNTERS.maxGapMs / 60_000, locale))}</p>
        <p>{t.position}</p>
        <p>{t.summaries}</p>
      </details>
    </div>
  );
}
