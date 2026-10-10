import { useId, useRef, useState, type ChangeEvent } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import type { CachedSite } from '../offline/types';
import './SitePicker.css';

export interface SitePickerProps {
  /** Sites cached on the device, so the choice also works offline. */
  readonly sites: readonly CachedSite[];
  /** The saved list has been read; before that an empty list is unknown, not "no sites". */
  readonly ready: boolean;
  readonly activeId: string | null;
  /** Resolves false when the choice could not be stored. */
  readonly onSelect: (siteId: string | null) => Promise<boolean>;
}

/**
 * The place new detections count for: the nearest saved one by default (ADR-25), or one chosen by hand. A native
 * select keeps the platform's accessible picker; with no places yet, the control leads to Places, where one is created.
 */
export function SitePicker({ sites, ready, activeId, onSelect }: SitePickerProps): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.listen.site;
  const id = useId();
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  // Keeps the row's height while the saved list is read, instead of flashing "No site" before the real one.
  if (!ready) return <span className="bn-listen-site" aria-hidden="true" />;

  if (sites.length === 0) {
    return (
      <a className="bn-listen-site bn-listen-site--link" href={routeHash({ name: 'sites' })} aria-label={t.create}>
        <span className="bn-listen-site__pin"><Icon name="sites" size="s" /></span>
        <span className="bn-listen-site__name">{t.none}</span>
        <span className="bn-listen-site__chevron"><Icon name="chevron" size="s" /></span>
      </a>
    );
  }

  const choose = (event: ChangeEvent<HTMLSelectElement>): void => {
    const siteId = event.target.value;
    // Only the latest choice reports back, so a slow earlier save cannot flag a later successful one.
    const request = ++latestRequest.current;
    void onSelect(siteId === '' ? null : siteId).then((saved) => {
      if (request === latestRequest.current) setFailed(!saved);
    });
  };

  return (
    <div className="bn-listen-site-field">
      <div className="bn-listen-site">
        <span className="bn-listen-site__pin"><Icon name="sites" size="s" /></span>
        <label className="visually-hidden" htmlFor={id}>{t.label}</label>
        <select id={id} className="bn-listen-site__select" value={activeId ?? ''} onChange={choose}>
          <option value="">{t.nearest}</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <span className="bn-listen-site__chevron"><Icon name="down" size="s" /></span>
      </div>
      {failed && <p className="bn-listen-site__error" role="alert">{t.error}</p>}
    </div>
  );
}
