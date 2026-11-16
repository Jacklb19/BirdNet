import { useId, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Dropdown } from '../../shared/ui/Dropdown';
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
 * The place new detections count for: the nearest saved one by default (ADR-25), or one chosen by hand from
 * Trino's own list (ADR-47); with no places yet, the control leads to Places, where one is created.
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

  const choose = (siteId: string): void => {
    // Only the latest choice reports back, so a slow earlier save cannot flag a later successful one.
    const request = ++latestRequest.current;
    void onSelect(siteId === '' ? null : siteId).then((saved) => {
      if (request === latestRequest.current) setFailed(!saved);
    });
  };

  return (
    <div className="bn-listen-site-field">
      <span id={id} className="visually-hidden">{t.label}</span>
      <Dropdown variant="pill" icon="sites" className="bn-listen-site-picker" labelId={id} value={activeId ?? ''} onChange={choose}
        options={[{ value: '', label: t.nearest }, ...sites.map((site) => ({ value: site.id, label: site.name }))]} />
      {failed && <p className="bn-listen-site__error" role="alert">{t.error}</p>}
    </div>
  );
}
