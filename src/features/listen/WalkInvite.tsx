import { useId, useState } from 'react';
import { navigateTo } from '../../app/routes';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatMeters, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { useWalk } from '../walk/walkContext';
import './WalkInvite.css';

export interface WalkInviteProps {
  /** Why a session cannot start yet, as the record button explains it; null when it can. */
  readonly blockedReason: string | null;
}

/** The other way to listen (ADR-25): on the move, with each bird pinned on the map. It starts the walk and opens the map. */
export function WalkInvite({ blockedReason }: WalkInviteProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen.walk;
  const walk = useWalk();
  const titleId = useId();
  const [failed, setFailed] = useState(false);

  const begin = (): void => {
    setFailed(false);
    void walk.start().then((started) => {
      if (started) navigateTo({ name: 'map' });
      else setFailed(true);
    });
  };

  return (
    <section className="bn-listen-walk" aria-labelledby={titleId}>
      <span className="bn-listen-walk__icon" aria-hidden="true"><Icon name="walk" /></span>
      <div className="bn-listen-walk__body">
        <h2 id={titleId} className="bn-listen-walk__title display">{t.title}</h2>
        <p>{t.text(formatMeters(APPROX_CELL_METERS, locale))}</p>
        <Button variant="secondary" icon="map" disabled={blockedReason !== null} onClick={begin}>{blockedReason ?? t.start}</Button>
        {failed && <p className="bn-listen-walk__error" role="alert">{t.failed}</p>}
      </div>
    </section>
  );
}
