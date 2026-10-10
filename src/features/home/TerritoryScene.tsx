import type { CSSProperties } from 'react';
import { useI18n } from '../../i18n';
import { Sticker } from '../../shared/ui/Sticker';
import { knownPlumage } from '../species/plumage';
import { HOME_TERRITORIES, HOME_TERRITORY_HEX, HOME_TERRITORY_PATH } from './home.config';
import './TerritoryScene.css';

const SQRT_3 = Math.sqrt(3);
const HEX_CORNERS = 6;
/** The scene is drawn in a 100 × 100 box around its centre. */
const CENTRE = 50;

function centreOf(q: number, r: number): { readonly x: number; readonly y: number } {
  return { x: CENTRE + HOME_TERRITORY_HEX * SQRT_3 * (q + r / 2), y: CENTRE + HOME_TERRITORY_HEX * 1.5 * r };
}

/** Outline of a pointy-top hexagon, slightly inset so neighbours show a seam between them. */
function outline(q: number, r: number): string {
  const { x, y } = centreOf(q, r);
  const radius = HOME_TERRITORY_HEX * 0.94;
  return Array.from({ length: HEX_CORNERS }, (_, corner) => {
    const angle = (Math.PI / 180) * (60 * corner - 30);
    return `${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

/**
 * The home page's picture of the map (ADR-24, ADR-25): the ground as hexagons, the walked ones tinted with the
 * plumage of the bird heard most in each and the rest still blank. An example, labelled as such in the caption.
 */
export function TerritoryScene(): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.home.map;
  return (
    <figure className="bn-territory-scene">
      <div className="bn-territory-scene__board" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          {HOME_TERRITORIES.map((cell) => (
            <polygon key={`${String(cell.q)},${String(cell.r)}`} points={outline(cell.q, cell.r)}
              className={cell.species ? 'bn-territory-scene__hex' : 'bn-territory-scene__hex bn-territory-scene__hex--blank'}
              style={cell.species ? { fill: `var(--plumage-${knownPlumage(cell.species)})` } : undefined} />
          ))}
          <path className="bn-territory-scene__path" d={HOME_TERRITORY_PATH} />
        </svg>
        {HOME_TERRITORIES.filter((cell) => cell.species && cell.pinned).map((cell, index) => {
          const { x, y } = centreOf(cell.q, cell.r);
          return (
            <span key={cell.species} className="bn-territory-scene__pin" style={{ '--x': x, '--y': y } as CSSProperties}>
              <Sticker scientificName={cell.species ?? ''} alt="" size="xs" drop order={index * 2} />
            </span>
          );
        })}
      </div>
      <figcaption className="bn-territory-scene__caption label">{texts.sceneCaption}</figcaption>
    </figure>
  );
}
