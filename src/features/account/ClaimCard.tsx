import { useId } from 'react';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import './ClaimCard.css';

export interface ClaimCardProps {
  readonly count: number;
  readonly working: boolean;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

/** Songs recorded before signing in are only attributed to the account when the person says so. */
export function ClaimCard({ count, working, onAccept, onDecline }: ClaimCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.claim;
  const titleId = useId();
  return (
    <section className="bn-account-claim" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-account-claim__title">{formatCount(texts.title, count, locale)}</h2>
      <p className="bn-account-claim__text">{texts.text}</p>
      <div className="bn-account-claim__actions">
        {/* aria-disabled instead of disabled: the pressed button keeps keyboard focus while the request runs. */}
        <Button onClick={() => { if (!working) onAccept(); }} aria-disabled={working} aria-busy={working}>{texts.accept}</Button>
        <Button variant="secondary" className="bn-account-claim__decline" onClick={() => { if (!working) onDecline(); }} aria-disabled={working}>{texts.decline}</Button>
      </div>
    </section>
  );
}
