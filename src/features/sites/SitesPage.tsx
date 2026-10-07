import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import type { CachedSite } from '../offline/types';
import { useOnline } from '../offline/useQueueStatus';
import { NewSiteForm } from './NewSiteForm';
import { SiteCard } from './SiteCard';
import { SitesAccessState } from './SitesAccessState';
import { CARD_PERIOD } from './sites.config';
import { useSites } from './useSites';
import './SitesPage.css';

/** The person's monitoring sites: a card per site, the active-site choice and the form to create one. */
export default function SitesPage(): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.sites;
  const { configured, session } = useAccountContext();
  const online = useOnline();
  // A failed creation is explained by the form itself; only a failed refresh is reported on the page.
  const { sites, active, ready, canEdit, loading, refreshError, select, refresh, create } = useSites();
  const [formOpen, setFormOpen] = useState(false);
  const [created, setCreated] = useState<CachedSite | null>(null);
  const [checked, setChecked] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectFailed, setSelectFailed] = useState(false);
  const uid = useId();
  const ids = { form: `${uid}-form`, why: `${uid}-why`, newButton: `${uid}-new` };

  // Fetched on entry and again when the account or the connection changes (refresh changes with them); useSites
  // shares the request with its own automatic refresh, so entering right after signing in fetches once.
  useEffect(() => {
    let current = true;
    void refresh().finally(() => { if (current) setChecked(true); });
    return () => { current = false; };
  }, [refresh]);

  const choose = (siteId: string | null): void => {
    setSelecting(true);
    setSelectFailed(false);
    void select(siteId).then((saved) => { setSelectFailed(!saved); }).finally(() => { setSelecting(false); });
  };

  const openForm = (): void => {
    setCreated(null);
    setFormOpen(true);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    // The button that opened the form is where the person continues.
    requestAnimationFrame(() => { document.getElementById(ids.newButton)?.focus(); });
  };

  const header = (
    <PageHeader title={t.title} actions={configured && (
      <Button id={ids.newButton} variant="quiet" icon="plus" className="bn-sites__new" disabled={!canEdit}
        aria-expanded={formOpen && canEdit} aria-controls={formOpen && canEdit ? ids.form : undefined}
        aria-describedby={canEdit ? undefined : ids.why} aria-label={t.newSiteTitle} onClick={formOpen ? closeForm : openForm}>
        {t.newSite}
      </Button>
    )} />
  );
  // A disabled button cannot be focused or explain itself, so the reason is visible and also its description.
  const why = configured && !canEdit && (
    <p id={ids.why} className="bn-sites__why">{session ? t.editNeedsConnection : t.editNeedsAccount}</p>
  );

  if (!configured || !session) {
    return (
      <Page className="bn-sites">
        {header}
        <div className="bn-sites__intro">
          <p>{t.intro}</p>
          {why}
        </div>
        <SitesAccessState reason={configured ? 'signedOut' : 'unconfigured'} />
      </Page>
    );
  }

  const empty = ready && !loading && sites.length === 0 && (checked || !canEdit);

  return (
    <Page className="bn-sites">
      {header}
      <div className="bn-sites__intro">
        <p>{t.intro}</p>
        {sites.length > 0 && <p>{t.cardsSummary(t.span[CARD_PERIOD])}</p>}
        {why}
      </div>
      {!online && <Notice tone="info" icon="offline" live>{t.offline}</Notice>}
      {refreshError && (
        <Notice tone="error" action={<Button variant="quiet" onClick={() => { void refresh(); }}>{dict.common.actions.retry}</Button>}>
          {t.loadError}
        </Notice>
      )}
      {selectFailed && <Notice tone="error">{t.selectError}</Notice>}
      {created && <Notice tone="success" icon="check" live>{t.created(created.name)}</Notice>}
      {formOpen && canEdit && (
        <NewSiteForm id={ids.form} onCreate={create} onCancel={closeForm}
          onCreated={(site) => { setCreated(site); closeForm(); }} />
      )}
      {!ready || (loading && sites.length === 0) ? (
        <p className="bn-sites__status" role="status">{dict.common.loading}</p>
      ) : empty ? (
        online ? (
          !formOpen && (
            <EmptyState icon="sites" title={t.emptyTitle} action={<Button icon="plus" onClick={openForm}>{t.newSiteTitle}</Button>}>
              <p>{t.emptyText}</p>
            </EmptyState>
          )
        ) : (
          <EmptyState icon="offline" title={t.offlineEmptyTitle}><p>{t.offlineEmptyText}</p></EmptyState>
        )
      ) : (
        <ul className="bn-sites__list">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} isActive={active?.id === site.id} online={online}
              busy={selecting} onSelect={choose} />
          ))}
        </ul>
      )}
    </Page>
  );
}
