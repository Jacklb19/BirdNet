/**
 * Joins the browser's measurements to a listening session: the battery where the Battery Status API exists (Chrome,
 * Edge and Samsung Internet; not Safari or Firefox) and the main thread's long tasks where the Long Tasks API exists.
 * The windows themselves are reported by the capture hook. Nothing leaves the phone.
 */
import { saveSession } from './performanceStore';
import { recordSession, type BatteryReading } from './sessionMetrics';

const LONG_TASK_ENTRY = 'longtask';

/** The part of the Battery Status API used here; TypeScript's DOM library does not declare it. */
interface BatteryManagerLike extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
}

interface NavigatorWithBattery {
  getBattery?: () => Promise<BatteryManagerLike>;
}

export interface SessionMonitor {
  model(version: string): void;
  analysed(latencyMs: number): void;
  dropped(count: number): void;
  /** Ends the session and keeps its summary; later calls do nothing. */
  finish(): void;
}

function observesLongTasks(): boolean {
  return typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes(LONG_TASK_ENTRY);
}

export function startSessionMonitor(now: () => number = Date.now): SessionMonitor {
  const longTasks = observesLongTasks();
  const recorder = recordSession(now(), longTasks);
  let finished = false;
  let observer: PerformanceObserver | null = null;
  let battery: BatteryManagerLike | null = null;
  const read = (): void => { if (battery) recorder.battery({ level: battery.level, charging: battery.charging } satisfies BatteryReading); };

  if (longTasks) {
    observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) recorder.longTask(entry.duration); });
    observer.observe({ type: LONG_TASK_ENTRY });
  }
  const getBattery = (navigator as NavigatorWithBattery).getBattery;
  // Without the API (or if it refuses) the summary says the browser gives no battery figure.
  getBattery?.call(navigator).then((manager) => {
    if (finished) return;
    battery = manager;
    read();
    manager.addEventListener('levelchange', read);
    manager.addEventListener('chargingchange', read);
  }).catch(() => undefined);

  return {
    model: (version) => { recorder.model(version); },
    analysed: (latencyMs) => { recorder.analysed(latencyMs); },
    dropped: (count) => { recorder.dropped(count); },
    finish() {
      if (finished) return;
      finished = true;
      read();
      observer?.disconnect();
      battery?.removeEventListener('levelchange', read);
      battery?.removeEventListener('chargingchange', read);
      saveSession(recorder.finish(now()));
    },
  };
}
