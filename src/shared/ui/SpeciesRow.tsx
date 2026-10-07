import { SpeciesPhoto } from './SpeciesPhoto';
import './SpeciesRow.css';

export type StatusTone = 'confirmed' | 'provisional' | 'verified' | 'corrected' | 'brand' | 'neutral';

export interface SpeciesRowProps {
  readonly scientificName: string;
  /** Common name in the active language, or the scientific name when there is none. */
  readonly name: string;
  /** Short text on the right (verification state, a count), colored by `tone`. */
  readonly status?: string;
  readonly tone?: StatusTone;
  readonly detail?: string;
  /** Highlighted in yellow while the bird is singing in the current window. */
  readonly singing?: boolean;
  /** `round` for lists of species rather than detections. */
  readonly photo?: 'row' | 'round';
  /** Opens another page: the row is a link. */
  readonly href?: string;
  /** Acts in place: the row is a button. */
  readonly onClick?: () => void;
}

export function SpeciesRow({
  scientificName, name, status, tone = 'neutral', detail, singing = false, photo = 'row', href, onClick,
}: SpeciesRowProps): React.JSX.Element {
  const body = (
    <>
      {/* The name is written beside the photo, so the photo stays silent instead of repeating it. */}
      <SpeciesPhoto scientificName={scientificName} alt="" variant={photo} />
      <span className="bn-species__names">
        {name === scientificName ? (
          // Without a common name the scientific one is the name: once, and in italics like every scientific name.
          <span className="bn-species__name scientific">{scientificName}</span>
        ) : (
          <>
            <span className="bn-species__name">{name}</span>
            <span className="bn-species__scientific scientific">{scientificName}</span>
          </>
        )}
      </span>
      {(status || detail) && (
        <span className="bn-species__meta">
          {status && <span className={`bn-species__status bn-species__status--${tone}`}>{status}</span>}
          {detail && <span className="bn-species__detail">{detail}</span>}
        </span>
      )}
    </>
  );
  const className = `bn-species${singing ? ' bn-species--singing' : ''}`;
  if (href) return <a className={`${className} bn-species--action`} href={href}>{body}</a>;
  if (onClick) return <button type="button" className={`${className} bn-species--action`} onClick={onClick}>{body}</button>;
  return <div className={className}>{body}</div>;
}
