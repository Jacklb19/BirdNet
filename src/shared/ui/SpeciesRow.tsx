import { SpeciesPhoto } from './SpeciesPhoto';
import './SpeciesRow.css';

export type StatusTone = 'confirmed' | 'provisional' | 'verified' | 'corrected' | 'brand' | 'neutral';

export interface SpeciesRowProps {
  readonly scientificName: string;
  readonly name: string;
  readonly status: string;
  readonly tone: StatusTone;
  readonly detail: string;
  /** Highlighted in yellow while the bird is singing in the current window. */
  readonly singing?: boolean;
  readonly onClick?: () => void;
}

export function SpeciesRow({ scientificName, name, status, tone, detail, singing = false, onClick }: SpeciesRowProps): React.JSX.Element {
  const body = (
    <>
      <SpeciesPhoto scientificName={scientificName} alt={name} />
      <span className="bn-species__names">
        <span className="bn-species__name">{name}</span>
        <span className="bn-species__scientific scientific">{scientificName}</span>
      </span>
      <span className="bn-species__meta">
        <span className={`bn-species__status bn-species__status--${tone}`}>{status}</span>
        <span className="bn-species__detail">{detail}</span>
      </span>
    </>
  );
  const className = `bn-species${singing ? ' bn-species--singing' : ''}`;
  return onClick
    ? <button type="button" className={`${className} bn-species--action`} onClick={onClick}>{body}</button>
    : <div className={className}>{body}</div>;
}
