import { useCallback, useState } from 'react';
import { useSpeciesPhoto, type SpeciesPhoto } from '../../features/species/speciesPhotos';

/**
 * `none`: there is no photo to show (none on Wikimedia, or the lookup failed). Otherwise the state of its image,
 * so `loaded` guarantees the photo and its credit can be shown together.
 */
export type SpeciesPhotoLoad = {
  /** Reported by the image element when its file loads or fails. */
  readonly settle: (url: string, loaded: boolean) => void;
} & (
  | { readonly status: 'none'; readonly photo: null }
  | { readonly status: 'loading' | 'loaded' | 'failed'; readonly photo: SpeciesPhoto }
);

interface Settled {
  readonly url: string;
  readonly loaded: boolean;
}

/**
 * The photo of a species and whether its image actually reached the screen. A caller that credits the
 * photographer creates it, passes it to SpeciesPhoto (`load`) and shows the credit only once `status` is `loaded`.
 */
export function useSpeciesPhotoLoad(scientificName: string | null): SpeciesPhotoLoad {
  const photo = useSpeciesPhoto(scientificName);
  const [settled, setSettled] = useState<Settled | null>(null);
  const settle = useCallback((url: string, loaded: boolean) => { setSettled({ url, loaded }); }, []);
  if (!photo) return { status: 'none', photo, settle };
  // A result belongs to one image file: another photo (another species) is loading until its own result arrives.
  if (settled?.url !== photo.url) return { status: 'loading', photo, settle };
  return { status: settled.loaded ? 'loaded' : 'failed', photo, settle };
}
