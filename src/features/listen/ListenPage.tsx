import { useIsDesktop } from '../../config/layout';
import { formatCount, useI18n } from '../../i18n';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useModel } from '../offline/useModel';
import { useSites } from '../sites/useSites';
import { ListenSpectrogram } from './ListenSpectrogram';
import { LiveBadge } from './LiveBadge';
import { useListening } from './listeningContext';
import { listPhase, sessionPhase, showsSessionError, startBlocker, type SessionPhase } from './listenState';
import { ModelNotice } from './ModelNotice';
import { PrivacyNote } from './PrivacyNote';
import { RecordButton } from './RecordButton';
import { SessionErrorNotice } from './SessionErrorNotice';
import { SessionList } from './SessionList';
import { SessionSince } from './SessionSince';
import { SingingHero } from './SingingHero';
import { SitePicker } from './SitePicker';
import './ListenPage.css';

type AnnouncedPhase = Extract<SessionPhase, 'preparingModel' | 'waitingMicrophone' | 'listening'>;

const isAnnounced = (phase: SessionPhase): phase is AnnouncedPhase =>
  phase === 'preparingModel' || phase === 'waitingMicrophone' || phase === 'listening';

/**
 * Listening screen: the active site, the live spectrogram, the species heard in this session and the one
 * control that starts and stops it. Phones keep the control at the bottom; wide screens add the singing-now card.
 */
export default function ListenPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.listen;
  const session = useListening();
  const model = useModel();
  const sites = useSites();
  const isDesktop = useIsDesktop();
  const { species, active, startedAt, sessionError } = session;
  const phase = sessionPhase(session);
  const siteName = sites.active?.name ?? null;
  const count = formatCount(t.list.count, species.length, locale);

  const title = active
    ? (siteName ? t.listeningAt(siteName) : t.listening)
    : (siteName ? t.listenAt(siteName) : t.title);

  // Polite announcement of the session's progress and of each new species; errors announce themselves.
  const status = isAnnounced(phase) ? t.announce[phase] : listPhase(active, species.length) === 'last' ? t.announce.stopped : null;
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
      actions={isDesktop ? <>{picker}{record}</> : undefined} />
  );
  const featured = isDesktop ? species[0] : undefined;

  return (
    <Page className="bn-listen">
      {isDesktop ? header : (
        <div className="bn-listen__bar">
          {/* The phone design has no visible title: the tab bar names the section, the heading stays for assistive technology. */}
          <div className="visually-hidden">{header}</div>
          {picker}
          {phase === 'listening' && <LiveBadge label={t.live} />}
        </div>
      )}
      <div className="bn-listen__content">
        {sessionError !== null && showsSessionError(sessionError, model.state) && <SessionErrorNotice error={sessionError} />}
        <ModelNotice model={model} active={active} />
        <ListenSpectrogram active={active} />
        <div className={`bn-listen__columns${featured ? ' bn-listen__columns--hero' : ''}`}>
          <SessionList species={species} phase={phase} active={active} />
          {featured && <SingingHero species={featured} active={active} />}
        </div>
        <PrivacyNote />
      </div>
      {!isDesktop && <div className="bn-listen__dock">{record}</div>}
      <p className="visually-hidden" role="status">{announcement}</p>
    </Page>
  );
}
