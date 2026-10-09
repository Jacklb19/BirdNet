import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { Sticker } from '../../shared/ui/Sticker';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import { plateStyle, usePlumage } from './plumage';
import './SpeciesPlate.css';

export interface PlateNote {
  readonly label: string;
  readonly value: string;
}

export interface SpeciesPlateProps {
  readonly scientificName: string;
  /** Common name in the interface language, or the scientific name when there is none. */
  readonly name: string;
  /** Small label above the name ("Singing now", "Species card"). */
  readonly eyebrow: ReactNode;
  /** Field-notebook annotations pointing at the sticker: confidence, state, records. */
  readonly notes: readonly PlateNote[];
  /** Heading level of the name: the card's title is the page h1, a plate inside a page uses h2. */
  readonly headingLevel?: 1 | 2;
  /** Lands with a bounce when the species changes (a new singer). */
  readonly drop?: boolean;
  readonly children?: ReactNode;
}

/**
 * A plate of the field guide (ADR-20): the screen takes the bird's plumage color, its photo sits on it as a die-cut
 * sticker, and annotations point at it like notes in a field notebook.
 */
export function SpeciesPlate({ scientificName, name, eyebrow, notes, headingLevel = 2, drop = false, children }: SpeciesPlateProps): React.JSX.Element {
  const { dict } = useI18n();
  const plumage = usePlumage(scientificName);
  const picture = useSpeciesPhotoLoad(scientificName);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className="bn-species-plate bn-plate" style={plateStyle(plumage)} aria-label={name}>
      <div className="bn-species-plate__text">
        <p className="bn-species-plate__eyebrow label">{eyebrow}</p>
        <Heading className="bn-species-plate__name display">{name}</Heading>
        {name !== scientificName && <p className="bn-species-plate__scientific scientific">{scientificName}</p>}
        {notes.length > 0 && (
          <dl className="bn-species-plate__notes">
            {notes.map((note) => (
              <div key={note.label} className="bn-species-plate__note">
                <dt className="label">{note.label}</dt>
                <dd>{note.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
      <div className="bn-species-plate__figure">
        {/* Keyed by species, so a new singer lands as a new sticker instead of swapping the photo in place. */}
        <Sticker key={scientificName} scientificName={scientificName} alt="" size="l" load={picture} drop={drop} />
        {picture.status === 'loaded' && (
          <p className="bn-species-plate__credit">{dict.common.photoCredit(picture.photo.author ?? dict.common.photoAuthorUnknown, picture.photo.license)}</p>
        )}
      </div>
    </section>
  );
}
