import { useId, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { scheduleSynchronization } from '../offline/offlineClient';
import { dispatchSyncError } from '../offline/offline.constants';
import { assignSiteToUnlocated } from '../offline/queueStore';
import type { CachedSite } from '../offline/types';
import './AssignSiteCard.css';

export interface AssignSiteCardProps {
  /** Records on this phone saved without a location (they never synchronize on their own). */
  readonly count: number;
  readonly sites: readonly CachedSite[];
  readonly activeSiteId: string | null;
}

/**
 * Rescues records saved without a location (ADR-16): the person files them under one of their sites, whose
 * approximate cell they take, and they upload with the next synchronization.
 */
export function AssignSiteCard({ count, sites, activeSiteId }: AssignSiteCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.log.assign;
  const selectId = useId();
  const [siteId, setSiteId] = useState(activeSiteId ?? sites[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ readonly kind: 'done'; readonly count: number } | { readonly kind: 'failed' } | null>(null);

  const assign = async (): Promise<void> => {
    if (working || !siteId) return;
    setWorking(true);
    setResult(null);
    try {
      const assigned = await assignSiteToUnlocated(siteId);
      setResult({ kind: 'done', count: assigned });
      void scheduleSynchronization().catch(dispatchSyncError);
    } catch {
      setResult({ kind: 'failed' });
    } finally { setWorking(false); }
  };

  return (
    <section className="bn-log-assign" aria-label={texts.label}>
      <span className="bn-log-assign__icon" aria-hidden="true"><Icon name="sites" /></span>
      <div className="bn-log-assign__body">
        <p className="bn-log-assign__title">{formatCount(texts.title, count, locale)}</p>
        <p className="bn-log-assign__text">{texts.text}</p>
        {sites.length > 0 ? (
          <div className="bn-log-assign__controls">
            <label htmlFor={selectId} className="visually-hidden">{texts.select}</label>
            <select id={selectId} className="bn-log-assign__select" value={siteId} onChange={(event) => { setSiteId(event.target.value); }}>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <Button aria-disabled={working || !siteId} aria-busy={working} onClick={() => { void assign(); }}>{texts.action}</Button>
          </div>
        ) : (
          <Button variant="secondary" icon="sites" href={routeHash({ name: 'sites' })}>{texts.createSite}</Button>
        )}
        {result?.kind === 'done' && <Notice tone="success" icon="check" live>{formatCount(texts.done, result.count, locale)}</Notice>}
        {result?.kind === 'failed' && <Notice tone="error">{texts.failed}</Notice>}
      </div>
    </section>
  );
}
