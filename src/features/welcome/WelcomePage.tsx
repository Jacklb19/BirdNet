import { formatBytes, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import { useModel } from '../offline/useModel';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { WELCOME_FEATURES, WELCOME_HERO_SPECIES } from './welcome.config';
import './WelcomePage.css';

/** First run (and #/welcome): what the app does, then straight to listening while the model downloads. */
export default function WelcomePage({ onFinish }: { readonly onFinish: () => void }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.welcome;
  const names = useSpeciesNames();
  const picture = useSpeciesPhotoLoad(WELCOME_HERO_SPECIES);
  const model = useModel();
  const birdName = commonName(names, WELCOME_HERO_SPECIES, locale);

  // A failed attempt (never with a usable model on the phone) is retried on start, so it reads like a missing model.
  const needsDownload = model.state === 'missing' || model.state === 'error';

  const note = ((): string => {
    if (model.state === 'unmanaged') return texts.note.unmanaged;
    if (model.state === 'downloading') return texts.note.downloading;
    if (model.installed && !needsDownload) return texts.note.ready;
    return model.available ? texts.note.download(formatBytes(model.available.size_bytes, locale)) : texts.note.downloadUnknownSize;
  })();

  const start = (): void => {
    // The download runs in the service worker and its state is shared, so Listen shows its progress after this
    // screen closes; pressing twice joins the same download.
    if (needsDownload) void model.download();
    onFinish();
  };

  return (
    <Page bleed className="bn-welcome">
      <figure className="bn-welcome__hero">
        <SpeciesPhoto load={picture} alt={birdName} variant="hero" className="bn-welcome__photo" />
        {picture.status === 'loaded' && (
          <figcaption className="bn-welcome__credit">
            {dict.common.photoCredit(picture.photo.author ?? dict.common.photoAuthorUnknown, picture.photo.license)}
          </figcaption>
        )}
      </figure>
      <div className="bn-welcome__content">
        <PageHeader title={texts.headline} />
        <ul className="bn-welcome__features" aria-label={texts.featuresLabel}>
          {WELCOME_FEATURES.map((feature) => (
            <li key={feature.id} className="bn-welcome__feature">
              <span className="bn-welcome__badge"><Icon name={feature.icon} size="s" /></span>
              <span>{texts.features[feature.id]}</span>
            </li>
          ))}
        </ul>
        <div className="bn-welcome__footer">
          <Button block onClick={start}>{texts.start}</Button>
          <p className="bn-welcome__note">{note}</p>
        </div>
      </div>
    </Page>
  );
}
