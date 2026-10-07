import { useI18n } from '../i18n';
import { useListening } from '../features/listen/listeningContext';
import { commonName, useSpeciesNames } from '../features/species/speciesNames';
import { Icon } from '../shared/ui/Icon';
import { SpeciesPhoto } from '../shared/ui/SpeciesPhoto';
import { formatClock } from '../shared/time';
import { useElapsed } from '../shared/useElapsed';
import { routeHash } from './routes';
import './LivePlayer.css';

export interface LivePlayerProps {
  /** `bar`: strip above the phone tab bar. `chip`: compact player inside the floating top bar. */
  readonly variant: 'bar' | 'chip';
}

/** What is singing, for how long the session has run, and a stop button — reachable from every section. */
export function LivePlayer({ variant }: LivePlayerProps): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const { active, singing, startedAt, modelStatus, stop } = useListening();
  const names = useSpeciesNames();
  const elapsed = useElapsed(startedAt);
  if (!active) return null;
  const name = singing ? commonName(names, singing.scientificName, locale, singing.label) : null;
  const title = name ? dict.app.live.singingNow(name) : modelStatus === 'loading' ? dict.app.live.preparing : dict.app.live.waiting;
  return (
    <section className={`bn-live bn-live--${variant}${singing ? ' bn-live--singing' : ''}`} aria-label={dict.app.live.region}>
      <a className="bn-live__open" href={routeHash({ name: 'listen' })} aria-label={`${title}. ${dict.app.live.open}`}>
        {singing && name
          ? <SpeciesPhoto scientificName={singing.scientificName} alt="" variant="round" className="bn-live__photo" />
          : <span className="bn-live__photo bn-live__photo--empty"><Icon name="bird" size="s" /></span>}
        <span className="bn-live__text">
          <span className="bn-live__title">{title}</span>
          <span className="bn-live__status">
            <span className="bn-live__dot" aria-hidden="true" />
            {dict.app.live.listening(formatClock(elapsed))}
          </span>
        </span>
      </a>
      <button type="button" className="bn-live__stop" onClick={() => { void stop(); }} aria-label={dict.app.live.stop}>
        <span className="bn-live__stop-icon" aria-hidden="true" />
      </button>
    </section>
  );
}
