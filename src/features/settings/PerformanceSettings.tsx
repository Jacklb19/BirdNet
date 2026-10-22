import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { ListGroup } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { clearSessions, readSessions, subscribeSessions } from '../performance/performanceStore';
import type { SessionSummary } from '../performance/sessionMetrics';
import { reportLines, reportText, sessionTitle, type DeviceFacts } from './performanceReport';
import './PerformanceSettings.css';

/** Chrome's Device Memory API; TypeScript's DOM library does not declare it. */
interface NavigatorWithMemory {
  readonly deviceMemory?: number;
}

function deviceFacts(): DeviceFacts {
  const cores = Number.isSafeInteger(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : null;
  const memory = (navigator as NavigatorWithMemory).deviceMemory;
  return { cores, memoryGb: typeof memory === 'number' && memory > 0 ? memory : null };
}

// One snapshot per change, so React compares the same array until the store says otherwise.
let snapshot: SessionSummary[] | null = null;
const subscribe = (listener: () => void): (() => void) => subscribeSessions(() => { snapshot = null; listener(); });
const getSnapshot = (): SessionSummary[] => (snapshot ??= readSessions());

/**
 * "Rendimiento de este teléfono" (S11): the figures of the last listening sessions next to the targets of RNF-01 to
 * RNF-04, as evidence for field tests. Everything is read from this phone; copying the summary is the person's act.
 */
export function PerformanceSettings(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.performance;
  const sessions = useSyncExternalStore(subscribe, getSnapshot, () => []);
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  const [latest, ...earlier] = sessions;

  const copySummary = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(reportText(sessions, texts, locale, deviceFacts(), navigator.userAgent));
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <ListGroup title={texts.title}>
      <div className="bn-settings-performance">
        <p className="bn-settings-performance__intro">{texts.intro}</p>
        {!latest && <p className="bn-settings-performance__muted">{texts.empty}</p>}
        {latest && (
          <>
            <h3 className="bn-settings-performance__session">{sessionTitle(latest, texts, locale)}</h3>
            <dl className="bn-settings-performance__lines">
              {reportLines(latest, texts, locale).map((line) => (
                <div key={line.label} className="bn-settings-performance__line">
                  <dt>{line.label}</dt>
                  <dd>
                    <span className="bn-settings-performance__value">{line.value}</span>
                    {line.target && <span className="bn-settings-performance__target">{texts.target(line.target)}</span>}
                    {line.met !== null && (
                      <span className={line.met ? 'bn-settings-performance__badge' : 'bn-settings-performance__badge bn-settings-performance__badge--missed'}>
                        <Icon name={line.met ? 'check' : 'pending'} size="s" />{line.met ? texts.met : texts.missed}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {earlier.length > 0 && (
              <details className="bn-settings-performance__earlier">
                <summary>{texts.earlier}</summary>
                <ul>
                  {earlier.map((session) => (
                    <li key={session.startedAt}>
                      <span className="bn-settings-performance__session">{sessionTitle(session, texts, locale)}</span>
                      <span className="bn-settings-performance__muted">
                        {reportLines(session, texts, locale).slice(1, 3).map((line) => `${line.label}: ${line.value}`).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="bn-settings-performance__actions">
              <Button variant="secondary" icon={copy === 'done' ? 'check' : undefined} onClick={() => { void copySummary(); }}>
                {copy === 'done' ? texts.copied : texts.copy}
              </Button>
              <Button variant="quiet" onClick={() => { clearSessions(); setCopy('idle'); }}>{texts.clear}</Button>
            </div>
            {copy === 'failed' && <Notice tone="error" live>{texts.copyFailed}</Notice>}
          </>
        )}
      </div>
    </ListGroup>
  );
}
