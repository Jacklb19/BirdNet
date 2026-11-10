import { useId } from 'react';
import { routeHash } from '../../app/routes';
import { PRIVACY_PAGE_URL } from '../../config/staticPages';
import { useI18n } from '../../i18n';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Sticker } from '../../shared/ui/Sticker';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { ENTRANCE_BIRDS } from './account.config';
import { useAccountContext } from './accountContext';
import { SecondStepForm } from './SecondStepForm';
import { SignInForm, type PasswordMode } from './SignInForm';
import './EntrancePage.css';

const POINTS: readonly { readonly id: 'cloud' | 'offline' | 'privacy'; readonly icon: IconName }[] = [
  { id: 'cloud', icon: 'synced' },
  { id: 'offline', icon: 'offline' },
  { id: 'privacy', icon: 'privacy' },
];

export interface EntrancePageProps {
  /** The side of the form the address asked for. */
  readonly mode: PasswordMode;
  /** Name of the screen of the account that was asked for without a session; null on `#/signin` and `#/signup`. */
  readonly requested: string | null;
}

/**
 * The way in (ADR-45). Trino is used only with an account: every screen of it shows this one until the person signs
 * in, and then the screen that was asked for, so a link to the log still lands on the log. It says what the account
 * keeps and what leaves the phone, and leaves the guide of birds, which is public, one link away.
 */
export default function EntrancePage({ mode, requested }: EntrancePageProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.entrance;
  const account = useAccountContext();
  const names = useSpeciesNames();
  const titleId = useId();
  const birdsId = useId();

  return (
    <div className="bn-entrance">
      <header className="bn-entrance__head">
        <h1 id={titleId} className="bn-entrance__title display">{texts.title}</h1>
        <p className="bn-entrance__lede">{texts.lede}</p>
      </header>

      <div className="bn-entrance__panel">
        {requested && <Notice tone="info" icon="account">{texts.requested(requested)}</Notice>}
        {account.deleted && (
          <Notice tone={account.deleted === 'done' ? 'success' : 'caution'} icon={account.deleted === 'done' ? 'check' : 'pending'} live>
            {dict.account.deletion[account.deleted]}
          </Notice>
        )}
        {!account.configured
          ? <Notice tone="caution" icon="privacy" title={dict.account.unavailable.title}>{dict.account.unavailable.text}</Notice>
          : account.awaitingCode ? <SecondStepForm account={account} /> : <SignInForm account={account} requestedMode={mode} />}
        <p className="bn-entrance__guide">
          {texts.guideLead}{' '}
          <a className="bn-entrance__link" href={routeHash({ name: 'album' })}>{texts.guide}</a>
        </p>
      </div>

      <aside className="bn-entrance__aside" aria-labelledby={titleId}>
        <figure className="bn-entrance__birds" aria-labelledby={birdsId}>
          <div className="bn-entrance__stickers">
            {ENTRANCE_BIRDS.map((species, index) => (
              <Sticker key={species} scientificName={species} alt="" size="m" drop order={index}
                className="bn-entrance__sticker" />
            ))}
          </div>
          <figcaption id={birdsId} className="bn-entrance__caption">
            <span className="label">{texts.birds}</span>
            <span>{ENTRANCE_BIRDS.map((species) => commonName(names, species, locale)).join(' · ')}</span>
          </figcaption>
        </figure>
        <ul className="bn-entrance__points">
          {POINTS.map((point) => (
            <li key={point.id} className="bn-entrance__point">
              <span className="bn-entrance__point-icon"><Icon name={point.icon} /></span>
              <span>
                <strong className="bn-entrance__point-title">{texts.points[point.id].title}</strong>
                <span className="bn-entrance__point-text">{texts.points[point.id].text}</span>
              </span>
            </li>
          ))}
        </ul>
        <a className="bn-entrance__link" href={PRIVACY_PAGE_URL}>{texts.privacy}</a>
      </aside>
    </div>
  );
}
