import { useEffect, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { SessionEntry } from '../../app/SessionEntry';
import { SiteBar, type SiteBarLink } from '../../app/SiteBar';
import { accountGroup, appLinks } from '../../app/siteMenu';
import { APPROX_CELL_METERS } from '../../config/contract';
import { PRIVACY_PAGE_URL } from '../../config/staticPages';
import { formatBytes, formatCount, formatMeters, formatNumber, formatPercent, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { useAccountContext } from '../account/accountContext';
import { requestSignInMode } from '../account/signInIntent';
import { downloadBytes } from '../inference/modelManifest';
import { formatTime } from '../log/logFormat';
import { useModel } from '../offline/useModel';
import { AlbumBook, BookCard } from '../species/AlbumBook';
import { usePlumage } from '../species/plumage';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import {
  HOME_ALBUM, HOME_BOOK_TABS, HOME_CARD_EXAMPLE, HOME_CARD_SPECIES, HOME_MAP_POINTS, HOME_PROMISES, HOME_SECTIONS, HOME_STEPS,
  type HomeSection,
} from './home.config';
import { TerritoryScene } from './TerritoryScene';
import { WalkScene } from './WalkScene';
import './HomePage.css';

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

/** A fixed morning, only to write the example card's hour in the reader's clock format. */
const exampleHour = new Date(2026, 0, 1, HOME_CARD_EXAMPLE.hour).getTime();

/**
 * Home page (ADR-15, ADR-24, ADR-27): the front of the one site Trino is. Its bar is the app's bar with this
 * page's sections in it, and the app is always one link away. It shows what the app does rather than announcing
 * it: a walk on which birds are pinned, the album they fill and a half-explored neighbourhood.
 */
export default function HomePage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.home;
  const names = useSpeciesNames();
  const model = useModel();
  const account = useAccountContext();
  const cardPlumage = usePlumage(HOME_CARD_SPECIES);
  const how = useRef<HTMLElement>(null);
  const guide = useRef<HTMLElement>(null);
  const map = useRef<HTMLElement>(null);
  const privacy = useRef<HTMLElement>(null);
  const [sections] = useState<SectionRefs>(() => ({ guide, how, map, privacy }));
  const current = useCurrentSection(sections);
  // A failed attempt (never with a usable model on the phone) is retried on entering, so it reads like a missing model.
  const needsDownload = model.state === 'missing' || model.state === 'error';
  const signedIn = account.session !== null;
  const listen = routeHash({ name: 'listen' });
  const accountHref = routeHash({ name: 'account' });
  // Someone signed in comes back to their app; a newcomer is invited to look around first.
  const enter = signedIn ? texts.open : texts.discover;

  // The download runs in the service worker and its state is shared, so Listen shows its progress.
  const prepare = (): void => { if (needsDownload) void model.download(); };
  const goTo = (section: HomeSection): void => { sections[section].current?.scrollIntoView({ block: 'start' }); };
  const toTop = (): void => { window.scrollTo({ top: 0 }); };

  const pageLinks: SiteBarLink[] = [
    { key: 'top', label: dict.app.nav.home, icon: 'home', current: current === null, onSelect: toTop },
    ...HOME_SECTIONS.map((section) => ({ key: section, label: texts.nav[section], current: current === section, onSelect: () => { goTo(section); } })),
  ];
  const albumTotal = HOME_ALBUM.found.length + HOME_ALBUM.missing.length;

  return (
    <div className="bn-home">
      <SiteBar navLabel={texts.navLabel} brandHref={routeHash({ name: 'home' })} onBrand={toTop} links={pageLinks}
        menu={[
          { key: 'page', label: dict.app.menuGroups.site, links: pageLinks },
          { key: 'app', label: dict.app.menuGroups.app, links: appLinks(dict, null).map((link) => ({ ...link, onSelect: prepare })) },
          accountGroup(dict, signedIn, 'home'),
        ]}
        end={(
          <>
            <SessionEntry />
            <Button href={listen} onClick={prepare}>{texts.open}</Button>
          </>
        )} />

      <div className="bn-home__page">
        <section className="bn-home__hero">
          <div className="bn-home__intro">
            <h1 className="bn-home__title display">{texts.title}</h1>
            <p className="bn-home__lede">{texts.lede}</p>
            <div className="bn-home__actions">
              <Button variant="accent" icon="walk" href={listen} onClick={prepare}>{enter}</Button>
              {!signedIn && (
                <Button variant="secondary" href={accountHref} onClick={() => { requestSignInMode('signIn'); }}>{dict.app.signIn}</Button>
              )}
            </div>
            {!signedIn && (
              <p className="bn-home__note">
                {texts.noAccountYet}{' '}
                <a className="bn-home__link" href={accountHref} onClick={() => { requestSignInMode('signUp'); }}>{texts.createIt}</a>
                {' '}{texts.noAccountNeeded}
              </p>
            )}
            {needsDownload && model.available && (
              <p className="bn-home__note">{texts.firstDownload(formatBytes(downloadBytes(model.available), locale))}</p>
            )}
          </div>
          <WalkScene />
        </section>

        <section ref={guide} className="bn-home__section" aria-labelledby="bn-home-album">
          <AlbumBook titleId="bn-home-album" eyebrow={texts.album.page}
            title={texts.album.found(formatNumber(HOME_ALBUM.found.length, locale), formatNumber(albumTotal, locale))}
            slots={[
              ...HOME_ALBUM.found.map((bird) => ({
                species: bird.species, name: commonName(names, bird.species, locale), found: true, note: formatCount(texts.album.songs, bird.songs, locale),
              })),
              ...HOME_ALBUM.missing.map((species) => ({ species, name: commonName(names, species, locale), found: false, note: texts.album.toFind })),
            ]}
            tabsLabel={texts.album.tabsLabel}
            tabs={HOME_BOOK_TABS.map((tab) => ({ key: tab.section, label: texts.nav[tab.section], plumage: tab.plumage, onSelect: () => { goTo(tab.section); } }))}
            right={(
              <BookCard eyebrow={texts.album.cardEyebrow} title={texts.album.cardTitle} species={HOME_CARD_SPECIES}
                name={commonName(names, HOME_CARD_SPECIES, locale)} plumage={cardPlumage} line={texts.album.cardLine}
                facts={[
                  { value: formatTime(exampleHour, locale), label: texts.album.facts.hour },
                  { value: texts.album.rangeExample, label: texts.album.facts.range },
                  { value: formatPercent(HOME_CARD_EXAMPLE.confidence, locale, 0), label: texts.album.facts.best },
                ]}>
                <p className="bn-home__muted">{texts.album.cardText}</p>
              </BookCard>
            )} />
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
                  <span className="bn-home__point-icon"><Icon name={point.icon} size="s" /></span>
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
          <Button variant="accent" icon="walk" href={listen} onClick={prepare}>{enter}</Button>
          <p>{texts.caveat}</p>
          <p className="bn-home__credits">{texts.credits}</p>
        </footer>
      </div>
    </div>
  );
}
