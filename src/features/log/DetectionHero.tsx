import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import './DetectionHero.css';

export interface DetectionHeroProps {
  readonly scientificName: string;
  readonly name: string;
}

/** Edge-to-edge photo with the way back on top of it and the photographer's credit, as the license requires. */
export function DetectionHero({ scientificName, name }: DetectionHeroProps): React.JSX.Element {
  const { dict } = useI18n();
  const picture = useSpeciesPhotoLoad(scientificName);
  return (
    <div className="bn-log-hero">
      <SpeciesPhoto load={picture} alt={name} variant="hero" className="bn-log-hero__photo" />
      <a className="bn-log-hero__back" href={routeHash({ name: 'log' })} aria-label={dict.log.detail.back}>
        <Icon name="back" />
      </a>
      {picture.status === 'loaded' && (
        <p className="bn-log-hero__credit">{dict.common.photoCredit(picture.photo.author ?? dict.common.photoAuthorUnknown, picture.photo.license)}</p>
      )}
    </div>
  );
}
