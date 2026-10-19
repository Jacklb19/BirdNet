import { useId, useState } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatMeters, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { scheduleSynchronization } from '../offline/offlineClient';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import './WalkSaveChoice.css';

/**
 * The question of ADR-35, asked after a walk while a signed-in person has not answered: whether their walks go to
 * their account. It says what leaves the phone (the path, to about 10 m, with its name and times), who sees it (only
 * them) and that the walks already on the phone go too. Until they say yes, nothing is sent.
 */
export function WalkSaveChoice({ phoneWalks }: { readonly phoneWalks: number }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.walk.choice;
  const { update } = useOfflineSettings();
  const titleId = useId();
  const [working, setWorking] = useState(false);
  const answer = async (save: boolean): Promise<void> => {
    setWorking(true);
    const stored = await update({ saveWalks: save });
    setWorking(false);
    if (stored && save) void scheduleSynchronization().catch(() => undefined);
  };
  return (
    <section className="bn-walk-choice" aria-labelledby={titleId}>
      <span className="bn-walk-choice__icon" aria-hidden="true"><Icon name="walk" /></span>
      <div className="bn-walk-choice__body">
        <h3 id={titleId} className="bn-walk-choice__title display">{t.title}</h3>
        <p className="bn-walk-choice__text">{t.text(formatMeters(APPROX_CELL_METERS, locale))}</p>
        {phoneWalks > 1 && <p className="bn-walk-choice__text">{formatCount(t.existing, phoneWalks, locale)}</p>}
        <div className="bn-walk-choice__actions">
          {/* aria-disabled instead of disabled: the pressed button keeps keyboard focus while the choice is saved. */}
          <Button variant="accent" aria-disabled={working} onClick={() => { if (!working) void answer(true); }}>{t.yes}</Button>
          <Button variant="secondary" aria-disabled={working} onClick={() => { if (!working) void answer(false); }}>{t.no}</Button>
        </div>
        <p className="bn-walk-choice__text">{t.later}</p>
      </div>
    </section>
  );
}
