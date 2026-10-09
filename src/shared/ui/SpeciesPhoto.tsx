import { Icon } from './Icon';
import { useSpeciesPhotoLoad, type SpeciesPhotoLoad } from './useSpeciesPhotoLoad';
import './SpeciesPhoto.css';

/**
 * The photo comes from a scientific name, or from a load state the caller keeps (useSpeciesPhotoLoad) when it needs
 * to know whether the image appeared, for instance to show the photo credit only with the photo.
 */
type PhotoSource =
  | { readonly scientificName: string; readonly load?: undefined }
  | { readonly load: SpeciesPhotoLoad; readonly scientificName?: undefined };

export type SpeciesPhotoProps = PhotoSource & {
  /** Accessible description, normally the common name. Empty when the name is already written next to the photo. */
  readonly alt: string;
  readonly variant?: 'row' | 'hero' | 'round' | 'sticker';
  readonly className?: string;
};

/** Real photo when Wikimedia has one, otherwise a neutral placeholder that never pretends to be the bird. */
export function SpeciesPhoto({ scientificName, load, alt, variant = 'row', className }: SpeciesPhotoProps): React.JSX.Element {
  const own = useSpeciesPhotoLoad(load ? null : scientificName);
  const { photo, status, settle } = load ?? own;
  const classes = ['bn-photo', `bn-photo--${variant}`, className ?? ''].filter(Boolean).join(' ');
  if (!photo || status === 'failed') {
    return alt
      ? <span className={`${classes} bn-photo--empty`} role="img" aria-label={alt}><Icon name="bird" /></span>
      : <span className={`${classes} bn-photo--empty`} aria-hidden="true"><Icon name="bird" /></span>;
  }
  // Keyed by file, so a new photo is a new element whose load or failure is reported for that file only.
  return (
    <img key={photo.url} className={classes} src={photo.url} alt={alt} crossOrigin="anonymous" loading="lazy" decoding="async"
      onLoad={() => { settle(photo.url, true); }} onError={() => { settle(photo.url, false); }} />
  );
}
