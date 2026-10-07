import { useState } from 'react';
import { useSpeciesPhoto } from '../../features/species/speciesPhotos';
import { Icon } from './Icon';
import './SpeciesPhoto.css';

export interface SpeciesPhotoProps {
  readonly scientificName: string;
  /** Accessible description, normally the common name. */
  readonly alt: string;
  readonly variant?: 'row' | 'hero' | 'round';
  readonly className?: string;
}

/** Real photo when Wikimedia has one, otherwise a neutral placeholder that never pretends to be the bird. */
export function SpeciesPhoto({ scientificName, alt, variant = 'row', className }: SpeciesPhotoProps): React.JSX.Element {
  const photo = useSpeciesPhoto(scientificName);
  const [failed, setFailed] = useState<string | null>(null);
  const classes = ['bn-photo', `bn-photo--${variant}`, className ?? ''].filter(Boolean).join(' ');
  if (!photo || failed === photo.url) {
    return <span className={`${classes} bn-photo--empty`} role="img" aria-label={alt}><Icon name="bird" /></span>;
  }
  return <img className={classes} src={photo.url} alt={alt} crossOrigin="anonymous" loading="lazy" decoding="async" onError={() => { setFailed(photo.url); }} />;
}
