import { useId } from 'react';
import { useIsDesktop } from '../../config/layout';
import { useI18n } from '../../i18n';
import { Notice } from '../../shared/ui/Notice';
import { Sticker } from '../../shared/ui/Sticker';
import { useSpeciesPhotoLoad } from '../../shared/ui/useSpeciesPhotoLoad';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { ENTRANCE_BIRDS } from './account.config';
import { useAccountContext } from './accountContext';
import { SecondStepForm } from './SecondStepForm';
import { SignInForm, type PasswordMode } from './SignInForm';
import './EntrancePage.css';

export interface EntrancePageProps {
  /** The side of the form the address asked for. */
  readonly mode: PasswordMode;
  /** Name of the screen of the account that was asked for without a session; null on `#/signin` and `#/signup`. */
  readonly requested: string | null;
}

/** One bird of the notebook page: its sticker, its name and, once the photo shows, who took it and under what license. */
function EntranceBird({ species, order }: { readonly species: string; readonly order: number }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const names = useSpeciesNames();
  const load = useSpeciesPhotoLoad(species);
  return (
    <li className="bn-entrance__bird">
      <Sticker scientificName={species} alt="" size="m" load={load} drop order={order} className="bn-entrance__sticker" />
      <span className="bn-entrance__bird-name display">{commonName(names, species, locale)}</span>
      <span className="bn-entrance__bird-science">{species}</span>
      {load.status === 'loaded' && (
        <span className="bn-entrance__bird-credit">{dict.common.photoCredit(load.photo.author ?? dict.common.photoAuthorUnknown, load.photo.license)}</span>
      )}
    </li>
  );
}

/**
 * The way in (ADR-45, ADR-47). Trino is used only with an account: every screen of it shows this one until the
 * person signs in, and then the screen that was asked for. Beside the form, a page of the field notebook with birds
 * of the guide; what the account keeps and shares is told where each permission is asked, not here.
 */
export default function EntrancePage({ mode, requested }: EntrancePageProps): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account.entrance;
  const account = useAccountContext();
  const isDesktop = useIsDesktop();
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
      </div>

      {/* Only beside the form: on a phone it would come after the form and add nothing to signing in (ADR-47). */}
      {isDesktop && (
        <section className="bn-entrance__notebook" aria-labelledby={birdsId}>
          <h2 id={birdsId} className="label bn-entrance__notebook-title">{texts.birds}</h2>
          <ul className="bn-entrance__birds">
            {ENTRANCE_BIRDS.map((species, index) => <EntranceBird key={species} species={species} order={index} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
