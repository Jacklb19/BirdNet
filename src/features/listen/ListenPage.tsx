import { useState } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { useIsDesktop } from '../../config/layout';
import { formatCount, formatMeters, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ShareChoiceCard } from '../account/ShareChoiceCard';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useModel } from '../offline/useModel';
import { useSites } from '../sites/useSites';
import { ListenContext, type ZoneSource } from './ListenContext';
import { LikelyBirds } from './LikelyBirds';
import { ListenSpectrogram } from './ListenSpectrogram';
import { useListening } from './listeningContext';
import { sessionPhase, showsSessionError, startBlocker, type SessionPhase } from './listenState';
import { ModelNotice } from './ModelNotice';
import { PrivacyNote } from './PrivacyNote';
import { RecentAlbum } from './RecentAlbum';
import { RecordButton } from './RecordButton';
import { SessionAlbum } from './SessionAlbum';
import { SessionErrorNotice } from './SessionErrorNotice';
import { SessionSince } from './SessionSince';
import { SingingPlate } from './SingingPlate';
import { SitePicker } from './SitePicker';
import { WalkInvite } from './WalkInvite';
import './ListenPage.css';

type AnnouncedPhase = Extract<SessionPhase, 'preparingModel' | 'waitingMicrophone' | 'listening'>;

const isAnnounced = (phase: SessionPhase): phase is AnnouncedPhase =>
  phase === 'preparingModel' || phase === 'waitingMicrophone' || phase === 'listening';

/**
 * Listening screen: where and when the session happens, the plate of the bird singing now, the live spectrogram,
 * the species of the session as swatches, and the one control that starts and stops it. Wide screens put the plate
 * and the session side by side; phones keep the control docked at the bottom.
 */
export default function ListenPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const session = useListening();
  const model = useModel();
  const sites = useSites();
  const { settings, update } = useOfflineSettings();
  const [locationFailed, setLocationFailed] = useState(false);
  const isDesktop = useIsDesktop();
  const { species, active, startedAt, sessionError, regionSpecies } = session;
  const phase = sessionPhase(session);
  const siteName = sites.active?.name ?? null;
  const count = formatCount(t.list.count, species.length, locale);
  // Same rule as the stored records (ADR-16, ADR-22): the device's cell first, then the active place's, otherwise none.
  const zone: ZoneSource = settings?.locationEnabled ? 'device' : sites.active ? 'site' : 'none';

  const title = active
    ? (siteName ? t.listeningAt(siteName) : t.listening)
    : (siteName ? t.listenAt(siteName) : t.title);

  // Polite announcement of the session's progress and of each new species; errors announce themselves.
  const status = isAnnounced(phase) ? t.announce[phase] : !active && species.length > 0 ? t.announce.stopped : null;
  const announcement = status && species.length > 0 ? t.announce.withCount(status, count) : status;

  const blocker = startBlocker(model.state);
  const record = (
    <RecordButton variant={isDesktop ? 'inline' : 'large'} active={active} startedAt={startedAt}
      blockedReason={blocker ? t.record[blocker] : null}
      onStart={() => { void session.start(); }} onStop={() => { void session.stop(); }} />
  );
  const picker = <SitePicker sites={sites.sites} ready={sites.ready} activeId={sites.active?.id ?? null} onSelect={sites.select} />;
  const header = (
    <PageHeader title={title} subtitle={startedAt !== null ? <SessionSince startedAt={startedAt} /> : undefined}
      actions={isDesktop ? record : undefined} />
  );

  return (
    <Page className="bn-listen">
      {/* The phone design has no visible title: the tab bar names the section, the heading stays for assistive technology. */}
      {isDesktop ? header : <div className="visually-hidden">{header}</div>}
      <ListenContext picker={picker} zone={zone} regionSpecies={regionSpecies} active={active} />

      <ShareChoiceCard />
      {sessionError !== null && showsSessionError(sessionError, model.state) && <SessionErrorNotice error={sessionError} />}
      <ModelNotice model={model} active={active} />
      {zone === 'none' && sites.ready && (
        <Notice tone="caution" icon="sites" title={t.noLocation.title}
          action={<Button variant="quiet" onClick={() => { void update({ locationEnabled: true }).then((saved) => { setLocationFailed(!saved); }); }}>{t.noLocation.action}</Button>}>
          {t.noLocation.text(formatMeters(APPROX_CELL_METERS, locale))}
          {locationFailed && <p role="alert">{t.noLocation.failed}</p>}
        </Notice>
      )}

      <div className="bn-listen__stage">
        <div className="bn-listen__main">
          <SingingPlate species={species[0] ?? null} active={active} phase={phase} />
          <ListenSpectrogram active={active} />
        </div>
        <div className="bn-listen__side">
          <SessionAlbum species={species} active={active} />
          {!active && <WalkInvite blockedReason={blocker ? t.record[blocker] : null} />}
          {species.length === 0 && <RecentAlbum />}
          {!active && <LikelyBirds />}
          <PrivacyNote />
        </div>
      </div>
      {!isDesktop && <div className="bn-listen__dock">{record}</div>}
      <p className="visually-hidden" role="status">{announcement}</p>
    </Page>
  );
}
