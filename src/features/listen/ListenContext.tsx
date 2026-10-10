import type { ReactNode } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatMeters, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { useNow } from '../../shared/useNow';
import { skyPhase } from '../../theme/sky';
import { formatTime } from '../log/logFormat';
import { CONTEXT_CLOCK_REFRESH_MS } from './listen.config';
import './ListenContext.css';

/** Where new songs are filed (ADR-16): the active site's cell, the device's cell, or nowhere yet. */
export type ZoneSource = 'site' | 'device' | 'none';

export interface ListenContextProps {
  /** The site picker, first, since it is the one control of the row. */
  readonly picker: ReactNode;
  readonly zone: ZoneSource;
  /** Species likely here this week per the geographic model; null when nothing is filtered. */
  readonly regionSpecies: number | null;
  readonly active: boolean;
}

/** Everything that frames the session at a glance: site, area, time of day and the geographic filter. */
export function ListenContext({ picker, zone, regionSpecies, active }: ListenContextProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen.context;
  const now = useNow(CONTEXT_CLOCK_REFRESH_MS, true);
  const distance = formatMeters(APPROX_CELL_METERS, locale);
  const zoneText = zone === 'site' ? t.zoneSite(distance) : zone === 'device' ? t.zoneDevice(distance) : t.zoneNone;
  return (
    <div className="bn-listen-context" role="group" aria-label={t.label}>
      {picker}
      <span className={`bn-listen-context__chip${zone === 'none' ? ' bn-listen-context__chip--warning' : ''}`}>
        <Icon name="locate" size="s" />{zoneText}
      </span>
      <span className="bn-listen-context__chip">
        <Icon name="clock" size="s" />{t.sky[skyPhase(new Date(now))]}{dict.common.separator}{formatTime(now, locale)}
      </span>
      {active && (
        <span className="bn-listen-context__chip">
          <Icon name="filter" size="s" />{regionSpecies === null ? t.regionOff : formatCount(t.region, regionSpecies, locale)}
        </span>
      )}
    </div>
  );
}
