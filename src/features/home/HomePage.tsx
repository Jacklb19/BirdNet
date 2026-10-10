import { useEffect, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { SiteBar } from '../../app/SiteBar';
import { APPROX_CELL_METERS } from '../../config/contract';
import { PRIVACY_PAGE_URL } from '../../config/staticPages';
import { formatBytes, formatMeters, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { downloadBytes } from '../inference/modelManifest';
import { useModel } from '../offline/useModel';
import { plateStyle, usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import {
  HOME_ALBUM, HOME_CARD_PARTS, HOME_CARD_SPECIES, HOME_MAP_POINTS, HOME_PROMISES, HOME_SECTIONS, HOME_STEPS, type HomeSection,
} from './home.config';
import { TerritoryScene } from './TerritoryScene';
import { WalkScene } from './WalkScene';
import './HomePage.css';

export interface HomePageProps {
  /** Records that the person has seen the home page and continues into the app (listening or the account). */
  readonly onEnter: (destination: 'listen' | 'account') => void;
}

type SectionRefs = Readonly<Record<HomeSection, React.RefObject<HTMLElement | null>>>;

/** Section of the page currently under the bar, so its link is marked; null above the first one. */
function useCurrentSection(sections: SectionRefs): HomeSection | null {
  const [current, setCurrent] = useState<HomeSection | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<HomeSection>();
    // A section counts once it crosses the upper third of the screen, where the eye is after following a link.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = HOME_SECTIONS.find((section) => sections[section].current === entry.target);
        if (!id) continue;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      // The last visible section in page order is the one the person has scrolled into.
      setCurrent(HOME_SECTIONS.filter((section) => visible.has(section)).at(-1) ?? null);
    }, { rootMargin: '-20% 0px -60% 0px' });
    for (const section of HOME_SECTIONS) {
      const node = sections[section].current;
      if (node) observer.observe(node);
    }
    return () => { observer.disconnect(); };
  }, [sections]);
  return current;
}

/**
 * Home page (ADR-15, ADR-24): a site that presents Trino, with its own sections, apart from the app. It opens with
 * what the app does, shown rather than announced: a walk on which birds are pinned, and the album they fill. One
 * door leads into the app ("Open Trino"); entering it also starts the one model download (ADR-19).
 */
export default function HomePage({ onEnter }: HomePageProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.home;
  const names = useSpeciesNames();
  const model = useModel();
  const cardPlumage = usePlumage(HOME_CARD_SPECIES);
  const how = useRef<HTMLElement>(null);
  const guide = useRef<HTMLElement>(null);
  const map = useRef<HTMLElement>(null);
  const privacy = useRef<HTMLElement>(null);
  const [sections] = useState<SectionRefs>(() => ({ guide, how, map, privacy }));
  const current = useCurrentSection(sections);
  // A failed attempt (never with a usable model on the phone) is retried on entering, so it reads like a missing model.
  const needsDownload = model.state === 'missing' || model.state === 'error';
  const albumTotal = HOME_ALBUM.found.length + HOME_ALBUM.missing.length;

  const open = (): void => {
    // The download runs in the service worker and its state is shared, so Listen shows its progress.
    if (needsDownload) void model.download();
    onEnter('listen');
  };

  return (
    <div className="bn-home">
      <SiteBar variant="site" navLabel={texts.navLabel} brandHref={routeHash({ name: 'home' })}
        links={HOME_SECTIONS.map((section) => ({
          key: section, label: texts.nav[section], current: current === section,
          onSelect: () => { sections[section].current?.scrollIntoView({ block: 'start' }); },
        }))}
        end={(
          <>
            <a className="bn-home__signin" href={routeHash({ name: 'account' })} onClick={(event) => { event.preventDefault(); onEnter('account'); }}>
              {texts.signIn}
            </a>
            <Button onClick={open}>{texts.open}</Button>
          </>
        )} />

      <div className="bn-home__page">
        <section className="bn-home__hero">
          <div className="bn-home__intro">
            <h1 className="bn-home__title display">{texts.title}</h1>
            <p className="bn-home__lede">{texts.lede}</p>
            <div className="bn-home__actions">
              <Button variant="accent" icon="walk" onClick={open}>{texts.open}</Button>
            </div>
            {needsDownload && model.available && (
              <p className="bn-home__note">{texts.firstDownload(formatBytes(downloadBytes(model.available), locale))}</p>
            )}
          </div>
          <WalkScene />
        </section>

        <section ref={guide} className="bn-home__album" aria-labelledby="bn-home-album">
          <div className="bn-home__album-page">
            <p className="label">{texts.album.page}</p>
            <h2 id="bn-home-album" className="bn-home__heading display">{texts.album.title}</h2>
            <p className="bn-home__muted">{texts.album.found(formatNumber(HOME_ALBUM.found.length, locale), formatNumber(albumTotal, locale))}</p>
            <ul className="bn-home__slots">
              {HOME_ALBUM.found.map((species, index) => (
                <li key={species} className="bn-home__slot">
                  <Sticker scientificName={species} alt="" size="m" drop order={index} />
                  <span className="bn-home__slot-name">{commonName(names, species, locale)}</span>
                </li>
              ))}
              {HOME_ALBUM.missing.map((species) => (
                <li key={species} className="bn-home__slot">
                  <Sticker scientificName={species} alt="" size="m" missing />
                  <span className="bn-home__slot-name">{commonName(names, species, locale)}</span>
                  <span className="label bn-home__muted">{texts.album.toFind}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bn-home__album-page">
            <h3 className="bn-home__heading display">{texts.album.cardTitle}</h3>
            <p className="bn-home__muted">{texts.album.cardText}</p>
            <div className="bn-home__card bn-plate" style={plateStyle(cardPlumage)}>
              <Sticker scientificName={HOME_CARD_SPECIES} alt="" size="m" />
              <span className="bn-home__card-text">
                <span className="bn-home__card-name display">{commonName(names, HOME_CARD_SPECIES, locale)}</span>
                <span className="scientific">{HOME_CARD_SPECIES}</span>
              </span>
            </div>
            <ul className="bn-home__parts">
              {HOME_CARD_PARTS.map((part) => (
                <li key={part.id} className="bn-home__part">
                  <span className="bn-home__part-icon"><Icon name={part.icon} size="s" /></span>
                  <span className="bn-home__part-text">
                    <span className="bn-home__part-title">{texts.guide.parts[part.id].title}</span>
                    <span>{texts.guide.parts[part.id].text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section ref={how} className="bn-home__section" aria-labelledby="bn-home-how">
          <h2 id="bn-home-how" className="bn-home__heading display">{texts.how.title}</h2>
          <ol className="bn-home__steps">
            {HOME_STEPS.map((step, index) => (
              <li key={step.id} className={`bn-home__step bn-home__step--${step.id}`}>
                <span className="label">{formatNumber(index + 1, locale)}</span>
                <span className="bn-home__step-icon" aria-hidden="true"><Icon name={step.icon} /></span>
                <h3 className="bn-home__step-title display">{texts.how.steps[step.id].title}</h3>
                <p>{texts.how.steps[step.id].text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section ref={map} className="bn-home__section bn-home__map" aria-labelledby="bn-home-map">
          <div className="bn-home__map-text">
            <h2 id="bn-home-map" className="bn-home__heading display">{texts.map.title}</h2>
            <p className="bn-home__lede">{texts.map.text}</p>
            <ul className="bn-home__points">
              {HOME_MAP_POINTS.map((point) => (
                <li key={point.id} className="bn-home__point">
                  <span className="bn-home__part-icon"><Icon name={point.icon} size="s" /></span>
                  <span>{texts.map.points[point.id]}</span>
                </li>
              ))}
            </ul>
          </div>
          <TerritoryScene />
        </section>

        <section ref={privacy} className="bn-home__section bn-home__privacy" aria-labelledby="bn-home-privacy">
          <h2 id="bn-home-privacy" className="bn-home__heading display">{texts.privacy.title}</h2>
          <ul className="bn-home__promises">
            {HOME_PROMISES.map((promise) => (
              <li key={promise.id} className="bn-home__promise">
                <Icon name={promise.icon} size="s" />
                <span>
                  {promise.id === 'location' ? texts.privacy.location(formatMeters(APPROX_CELL_METERS, locale)) : texts.privacy.promises[promise.id]}
                </span>
              </li>
            ))}
          </ul>
          <a className="bn-home__privacy-link" href={PRIVACY_PAGE_URL}>{texts.privacy.link}</a>
        </section>

        <footer className="bn-home__footer">
          <Button variant="accent" icon="walk" onClick={open}>{texts.open}</Button>
          <p>{texts.caveat}</p>
          <p className="bn-home__credits">{texts.credits}</p>
        </footer>
      </div>
    </div>
  );
}
