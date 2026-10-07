import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { accountInitials } from './accountInitials';
import './ProfileCard.css';

export interface ProfileCardProps {
  /** The account only has an e-mail; no display name is invented for it. */
  readonly email: string | null;
  /** Shown under the identity, separated by a rule (the synchronization state). */
  readonly children: ReactNode;
}

/** Who is signed in, followed by what concerns this account on this phone. */
export function ProfileCard({ email, children }: ProfileCardProps): React.JSX.Element {
  const { dict } = useI18n();
  const initials = accountInitials(email);
  return (
    <section className="bn-account-profile" aria-label={dict.account.profile.label}>
      <div className="bn-account-profile__identity">
        {/* Decorative: the e-mail next to it already says whose account this is. */}
        <span className="bn-account-profile__avatar" aria-hidden="true">{initials ?? <Icon name="account" />}</span>
        <div className="bn-account-profile__names">
          <p className="bn-account-profile__email">{email}</p>
          <p className="bn-account-profile__state">{dict.account.profile.signedIn}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
