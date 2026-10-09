import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { SpeciesPlate } from '../species/SpeciesPlate';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { confidenceText } from './listenFormat';
import { displayStatus, type SessionPhase } from './listenState';
import type { SessionSpecies } from './session';
import './SingingPlate.css';

export interface SingingPlateProps {
  /** The bird singing now, or the last one heard; null before the first detection of the session. */
  readonly species: SessionSpecies | null;
  readonly active: boolean;
  readonly phase: SessionPhase;
}

type IdleKey = 'idle' | 'preparingModel' | 'waitingMicrophone' | 'waiting';

function idleKey(phase: SessionPhase): IdleKey {
  if (phase === 'preparingModel' || phase === 'waitingMicrophone') return phase;
  return phase === 'listening' ? 'waiting' : 'idle';
}

/**
 * The plate of the current singer (ADR-20): its plumage floods the plate when it starts singing and its sticker
 * lands on it. Before any detection the plate explains what is happening instead of staying empty.
 */
export function SingingPlate({ species, active, phase }: SingingPlateProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const names = useSpeciesNames();
  if (!species) {
    const key = idleKey(phase);
    return (
      <section className={`bn-listen-idle bn-plate${phase === 'listening' ? ' bn-listen-idle--live' : ''}`}>
        <span className="bn-listen-idle__rings" aria-hidden="true"><span /><span /><span /></span>
        <h2 className="bn-listen-idle__title display">{t.states[key].title}</h2>
        <p>{t.states[key].text}</p>
        {key === 'waiting' && <p className="bn-listen-idle__caveat">{dict.common.absenceCaveat}</p>}
      </section>
    );
  }
  const name = commonName(names, species.scientificName, locale, species.label);
  const status = displayStatus(species.status);
  const singing = active && species.singingNow;
  return (
    <SpeciesPlate scientificName={species.scientificName} name={name} drop
      eyebrow={<>{singing && <span className="bn-listen-plate__dot" aria-hidden="true" />}{singing ? t.hero.now : t.hero.last}</>}
      notes={[
        { label: t.plate.notes.confidence, value: confidenceText(species.confidence, locale) },
        { label: t.plate.notes.status, value: dict.common.status[status] },
        { label: t.plate.notes.windows, value: formatCount(t.session.windows, species.windows, locale) },
      ]}>
      <p className="bn-listen-plate__meaning">{status === 'confirmed' ? t.hero.confirmed : t.hero.provisional}</p>
      <Button className="bn-listen-plate__open" icon="book" href={routeHash({ name: 'species', species: species.scientificName })}>{t.plate.open}</Button>
    </SpeciesPlate>
  );
}
