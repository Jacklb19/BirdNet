import { useId } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatMeters, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { useAccountContext } from './accountContext';
import { useSharing } from './useSharing';
import './ShareChoiceCard.css';

/**
 * Asks once, in plain words, whether the person's songs go to everyone's map (ADR-22). Shown to a signed-in person
 * who has not answered; until then nothing is shared. The answer can be changed in Settings.
 */
export function ShareChoiceCard(): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const texts = dict.account.share;
  const { session } = useAccountContext();
  const sharing = useSharing();
  const titleId = useId();
  if (!session || !sharing.ready || sharing.choice !== undefined) return null;
  return (
    <section className="bn-account-share" aria-labelledby={titleId}>
      <span className="bn-account-share__icon" aria-hidden="true"><Icon name="map" /></span>
      <div className="bn-account-share__body">
        <h2 id={titleId} className="bn-account-share__title display">{texts.title}</h2>
        <p className="bn-account-share__text">{texts.text(formatMeters(APPROX_CELL_METERS, locale))}</p>
        <div className="bn-account-share__actions">
          {/* aria-disabled instead of disabled: the pressed button keeps keyboard focus while the choice is saved. */}
          <Button variant="accent" aria-disabled={sharing.working} onClick={() => { if (!sharing.working) void sharing.choose(true); }}>{texts.accept}</Button>
          <Button variant="secondary" aria-disabled={sharing.working} onClick={() => { if (!sharing.working) void sharing.choose(false); }}>{texts.decline}</Button>
        </div>
      </div>
    </section>
  );
}
