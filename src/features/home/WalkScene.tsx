import { useEffect, useState, type CSSProperties } from 'react';
import { useI18n } from '../../i18n';
import { Sticker } from '../../shared/ui/Sticker';
import { useReducedMotion } from '../../shared/useReducedMotion';
import { plateStyle, usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { HOME_WALK, HOME_WALK_STEP_MS, WALK_PATH } from './home.config';
import './WalkScene.css';

/**
 * The home page's demonstration (ADR-24): a drawn walk on which birds are pinned one after another while the plate
 * below takes the color of the one "singing". It is an example, labelled as such; nothing here is a real detection.
 * With reduced motion the walk is shown complete and the plate stays on the last bird.
 */
export function WalkScene(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.home.scene;
  const names = useSpeciesNames();
  const still = useReducedMotion();
  const last = HOME_WALK.length - 1;
  const [step, setStep] = useState(0);
  const current = HOME_WALK[still ? last : step] ?? HOME_WALK[0];
  const plumage = usePlumage(current.species);

  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => { setStep((value) => (value + 1) % HOME_WALK.length); }, HOME_WALK_STEP_MS);
    return () => { window.clearInterval(timer); };
  }, [still]);

  return (
    <figure className="bn-walk-scene" aria-label={texts.label}>
      <div className="bn-walk-scene__map" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect className="bn-walk-scene__land" width="100" height="100" />
          <path className="bn-walk-scene__park" d="M0 62 C22 54 38 70 60 62 S90 44 100 48 V100 H0Z" />
          <path className="bn-walk-scene__water" d="M70 0 C66 22 78 38 72 62 S80 88 76 100" />
          <path className="bn-walk-scene__road" d="M0 22 L100 12 M0 46 L100 38 M22 0 L30 100 M48 0 L54 100" />
          <path className="bn-walk-scene__path" d={WALK_PATH} pathLength={1} />
        </svg>
        {HOME_WALK.map((bird, index) => (
          <span key={bird.species} className="bn-walk-scene__pin" style={{ '--x': bird.x, '--y': bird.y } as CSSProperties}>
            <Sticker scientificName={bird.species} alt="" size="s" drop order={index * 3} />
          </span>
        ))}
      </div>
      <figcaption className="bn-walk-scene__plate bn-plate" style={plateStyle(plumage)}>
        <Sticker key={current.species} scientificName={current.species} alt="" size="s" drop={!still} />
        <span className="bn-walk-scene__text">
          <span className="label">{texts.now}{dict.common.separator}{texts.example}</span>
          <span className="bn-walk-scene__name display">{commonName(names, current.species, locale)}</span>
          <span className="scientific">{current.species}</span>
        </span>
      </figcaption>
    </figure>
  );
}
