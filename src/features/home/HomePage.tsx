import { routeHash } from '../../app/routes';
import { PRIVACY_PAGE_URL } from '../../config/staticPages';
import { formatBytes, useI18n } from '../../i18n';
import { BrandMark } from '../../shared/ui/BrandMark';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { useModel } from '../offline/useModel';
import { plateStyle, usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { HOME_COLLAGE_SPECIES, HOME_FEATURES, HOME_PROMISES, HOME_STEPS } from './home.config';
import { downloadBytes } from '../inference/modelManifest';
import './HomePage.css';

function CollageBird({ scientificName, order }: { readonly scientificName: string; readonly order: number }): React.JSX.Element {
  const { locale } = useI18n();
  const names = useSpeciesNames();
  const plumage = usePlumage(scientificName);
  const name = commonName(names, scientificName, locale);
  return (
    <li className="bn-home__bird" style={plateStyle(plumage)}>
      <span className="bn-home__blob bn-plate" aria-hidden="true" />
      <Sticker scientificName={scientificName} alt="" size="m" drop order={order} />
      <span className="bn-home__tag label">{name}</span>
    </li>
  );
}

export interface HomePageProps {
  /** Records that the person has seen the home page and continues into the app (listening or the account). */
  readonly onEnter: (destination: 'listen' | 'account') => void;
}

/**
 * Home page (ADR-15): what Trino is, how it works and how it treats privacy, with the two ways in. The first
 * "start" also starts the one model download (ADR-19); nothing else is downloaded without being asked for.
 */
export default function HomePage({ onEnter }: HomePageProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.home;
  const model = useModel();
  // A failed attempt (never with a usable model on the phone) is retried on start, so it reads like a missing model.
  const needsDownload = model.state === 'missing' || model.state === 'error';

  const note = ((): string => {
    if (model.state === 'unmanaged') return texts.note.unmanaged;
    if (model.state === 'downloading') return texts.note.downloading;
    if (model.installed && !needsDownload) return texts.note.ready;
    return model.available ? texts.note.download(formatBytes(downloadBytes(model.available), locale)) : texts.note.downloadUnknownSize;
  })();

  const start = (): void => {
    // The download runs in the service worker and its state is shared, so Listen shows its progress.
    if (needsDownload) void model.download();
    onEnter('listen');
  };

  return (
    <div className="bn-home">
      <header className="bn-home__top">
        <BrandMark name={dict.app.name} />
        <a className="bn-home__signin" href={routeHash({ name: 'account' })} onClick={(event) => { event.preventDefault(); onEnter('account'); }}>
          {texts.signIn}
        </a>
      </header>

      <section className="bn-home__hero">
        <div className="bn-home__intro">
          <h1 className="bn-home__headline display">
            {texts.headline} <em className="bn-home__accent">{texts.headlineAccent}</em>
          </h1>
          <p className="bn-home__lede">{texts.lede}</p>
          <div className="bn-home__actions">
            <Button variant="accent" icon="listen" onClick={start}>{texts.start}</Button>
            <Button variant="secondary" href={routeHash({ name: 'account' })} onClick={(event: React.MouseEvent) => { event.preventDefault(); onEnter('account'); }}>
              {texts.account}
            </Button>
          </div>
          <p className="bn-home__note">{note}</p>
        </div>
        <ul className="bn-home__collage" aria-label={texts.collageLabel}>
          {HOME_COLLAGE_SPECIES.map((species, index) => <CollageBird key={species} scientificName={species} order={index} />)}
        </ul>
      </section>

      <section className="bn-home__section" aria-labelledby="bn-home-how">
        <h2 id="bn-home-how" className="bn-home__title display">{texts.howTitle}</h2>
        <ol className="bn-home__steps">
          {HOME_STEPS.map((step, index) => (
            <li key={step} className="bn-home__step">
              <span className="bn-home__step-number" aria-hidden="true">{index + 1}</span>
              <h3 className="bn-home__step-title display">{texts.steps[step].title}</h3>
              <p>{texts.steps[step].text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bn-home__section" aria-labelledby="bn-home-features">
        <h2 id="bn-home-features" className="bn-home__title display">{texts.featuresTitle}</h2>
        <ul className="bn-home__features">
          {HOME_FEATURES.map((feature) => (
            <li key={feature.id} className="bn-home__feature">
              <span className="bn-home__feature-icon"><Icon name={feature.icon} /></span>
              <h3 className="bn-home__feature-title">{texts.features[feature.id].title}</h3>
              <p>{texts.features[feature.id].text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bn-home__section bn-home__privacy" aria-labelledby="bn-home-privacy">
        <h2 id="bn-home-privacy" className="bn-home__title display">{texts.privacyTitle}</h2>
        <ul className="bn-home__promises">
          {HOME_PROMISES.map((promise) => (
            <li key={promise.id} className="bn-home__promise">
              <Icon name={promise.icon} size="s" />
              <span>{texts.promises[promise.id]}</span>
            </li>
          ))}
        </ul>
        <a className="bn-home__privacy-link" href={PRIVACY_PAGE_URL}>{texts.privacyLink}</a>
      </section>

      <footer className="bn-home__footer">
        <p>{texts.caveat}</p>
        <p className="bn-home__credits">{texts.credits}</p>
      </footer>
    </div>
  );
}
