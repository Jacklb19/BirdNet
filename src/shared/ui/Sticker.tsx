import type { CSSProperties } from 'react';
import { stickerTilt } from '../../features/species/plumage';
import { SpeciesPhoto } from './SpeciesPhoto';
import type { SpeciesPhotoLoad } from './useSpeciesPhotoLoad';
import './Sticker.css';

export type StickerSize = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface StickerProps {
  readonly scientificName: string;
  /** Accessible description; empty when the name is written next to the sticker. */
  readonly alt: string;
  readonly size?: StickerSize;
  /** Load state kept by the caller when it shows the photo credit (see SpeciesPhoto). */
  readonly load?: SpeciesPhotoLoad;
  /** Lands with a small bounce when it first appears (a new species in the session, an album page). */
  readonly drop?: boolean;
  /** Position in a group that drops together, so the stickers land one after another. */
  readonly order?: number;
  /** An album slot still to fill: the bird's photo faded behind a dashed outline, so the person knows what to look for. */
  readonly missing?: boolean;
  readonly className?: string;
}

/**
 * A species photo die-cut like an album sticker (ADR-20): white edge, irregular outline and a slight tilt that
 * belongs to the species, so the same bird always sits the same way.
 */
export function Sticker({ scientificName, alt, size = 'm', load, drop = false, order = 0, missing = false, className }: StickerProps): React.JSX.Element {
  const style = { '--tilt': stickerTilt(scientificName), '--order': order } as CSSProperties;
  const classes = ['bn-sticker', `bn-sticker--${size}`, drop ? 'bn-sticker--drop' : '', missing ? 'bn-sticker--missing' : '', className ?? '']
    .filter(Boolean).join(' ');
  return (
    <span className={classes} style={style}>
      {load
        ? <SpeciesPhoto load={load} alt={alt} variant="sticker" />
        : <SpeciesPhoto scientificName={scientificName} alt={alt} variant="sticker" />}
    </span>
  );
}
