import { useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { FIELD_LIMITS } from '../../config/contract';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { useOnline } from '../offline/useQueueStatus';
import { accountInitials } from './accountInitials';
import type { AccountState } from './useAccount';
import './ProfileCard.css';

export interface ProfileCardProps {
  readonly account: AccountState;
  /** Shown under the identity, separated by a rule (the synchronization state). */
  readonly children: ReactNode;
}

/**
 * Who is signed in: photo, alias and e-mail, each editable here (ADR-21). The photo is resized on the phone before
 * it is uploaded; offline the controls wait for the connection instead of failing.
 */
export function ProfileCard({ account, children }: ProfileCardProps): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account.profile;
  const online = useOnline();
  const email = account.session?.user.email ?? null;
  const alias = account.profile?.alias ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const aliasId = useId();
  const initials = accountInitials(alias ?? email);
  const blocked = !online || account.working;

  const startEditing = (): void => { setDraft(alias ?? ''); setEditing(true); };
  const save = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (blocked) return;
    if (await account.saveAlias(draft)) setEditing(false);
  };
  const pickPhoto = (files: FileList | null): void => {
    const file = files?.[0];
    if (file && !blocked) void account.saveAvatar(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="bn-account-profile" aria-label={texts.label}>
      <div className="bn-account-profile__identity">
        <span className="bn-account-profile__avatar-wrap">
          {account.profile?.avatarUrl
            ? <img className="bn-account-profile__avatar" src={account.profile.avatarUrl} alt={texts.photoAlt} crossOrigin="anonymous" />
            : <span className="bn-account-profile__avatar" aria-hidden="true">{initials ?? <Icon name="account" />}</span>}
          <button type="button" className="bn-account-profile__photo" aria-disabled={blocked}
            onClick={() => { if (!blocked) fileRef.current?.click(); }}>
            <Icon name="camera" size="s" />
            <span className="visually-hidden">{texts.changePhoto}</span>
          </button>
          <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" tabIndex={-1} aria-hidden="true"
            onChange={(event) => { pickPhoto(event.target.files); }} />
        </span>
        <div className="bn-account-profile__names">
          {editing ? (
            <form className="bn-account-profile__alias-form" onSubmit={(event) => { void save(event); }}>
              <label className="visually-hidden" htmlFor={aliasId}>{texts.alias}</label>
              <input id={aliasId} className="bn-account-signin__input" value={draft} maxLength={FIELD_LIMITS.alias} autoComplete="nickname"
                placeholder={texts.aliasPlaceholder} onChange={(event) => { setDraft(event.target.value); }} />
              <span className="bn-account-profile__alias-actions">
                <Button type="submit" aria-disabled={blocked} aria-busy={account.working}>{dict.common.actions.save}</Button>
                <Button variant="quiet" onClick={() => { setEditing(false); }}>{dict.common.actions.cancel}</Button>
              </span>
            </form>
          ) : (
            <>
              <p className="bn-account-profile__alias display">{alias ?? texts.noAlias}</p>
              <p className="bn-account-profile__email">{email}</p>
              <button type="button" className="bn-account-profile__edit" aria-disabled={blocked} onClick={() => { if (!blocked) startEditing(); }}>
                {alias ? texts.editAlias : texts.addAlias}
              </button>
            </>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
