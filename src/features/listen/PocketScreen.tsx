import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatCount, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { formatClock } from '../../shared/time';
import { useElapsed } from '../../shared/useElapsed';
import { useScreenAwake } from '../../shared/useScreenAwake';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { POCKET_EXIT_HOLD_MS } from './listen.config';
import { useListening } from './listeningContext';
import { leavePocketMode, returnPocketFocus } from './pocketMode';
import './PocketScreen.css';

const HOLD_STYLE = { '--pocket-hold': `${String(POCKET_EXIT_HOLD_MS)}ms` } as CSSProperties;

/**
 * The black screen of pocket mode (`pocketMode.ts`). It keeps the screen on, shows the session dimly and takes
 * every touch: the fabric of a pocket presses a screen all the time, so only a long press on the one button
 * leaves. A keyboard cannot be pressed by accident: Enter, Space or Escape leave at once.
 */
export function PocketScreen(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen.pocket;
  const { singing, species, startedAt } = useListening();
  const names = useSpeciesNames();
  const elapsed = useElapsed(startedAt);
  const awake = useScreenAwake(true);
  const titleId = useId();
  const exit = useRef<HTMLButtonElement>(null);
  const [holding, setHolding] = useState(false);

  // Focus goes to the one control and returns to where it was, as with any dialog.
  useEffect(() => {
    exit.current?.focus();
    return returnPocketFocus;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') leavePocketMode(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(leavePocketMode, POCKET_EXIT_HOLD_MS);
    return () => { window.clearTimeout(timer); };
  }, [holding]);

  const release = (): void => { setHolding(false); };
  const name = singing ? commonName(names, singing.scientificName, locale, singing.label) : null;

  return (
    <div className="bn-pocket" role="dialog" aria-modal="true" aria-labelledby={titleId} style={HOLD_STYLE}>
      <div className="bn-pocket__session">
        <Icon name="listen" />
        <h2 id={titleId} className="bn-pocket__title">{t.title}</h2>
        <p>{t.listening(formatClock(elapsed))}</p>
        <p>{formatCount(dict.listen.list.count, species.length, locale)}</p>
        {name && <p>{t.singing(name)}</p>}
      </div>
      <div className="bn-pocket__foot">
        {/* A click without a pointer comes from the keyboard or an assistive technology, which cannot hold. */}
        <button ref={exit} type="button" className={`bn-pocket__exit${holding ? ' bn-pocket__exit--holding' : ''}`}
          onPointerDown={() => { setHolding(true); }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
          onContextMenu={(event) => { event.preventDefault(); }}
          onClick={(event) => { if (event.detail === 0) leavePocketMode(); }}>
          <span className="bn-pocket__fill" aria-hidden="true" />
          <span className="bn-pocket__label">{t.exit}</span>
        </button>
        {awake === 'refused' ? <p role="alert">{t.refused}</p> : <p>{t.note}</p>}
      </div>
    </div>
  );
}
