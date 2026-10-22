import { STORAGE_KEYS } from '../../config/storage';
import { PERFORMANCE_LIMITS } from './performance.config';
import type { BatteryGap, SessionSummary } from './sessionMetrics';

const BATTERY_GAPS: readonly BatteryGap[] = ['unsupported', 'charging', 'short'];
/** Same-tab listeners: the storage event only reaches other tabs. */
const listeners = new Set<() => void>();

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isMeasure = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

function isSummary(value: unknown): value is SessionSummary {
  const row = value as Record<string, unknown> | null;
  return !!row && typeof row.startedAt === 'string' && !Number.isNaN(Date.parse(row.startedAt)) && isCount(row.durationSeconds)
    && (row.model === null || typeof row.model === 'string') && isCount(row.analysed) && isCount(row.dropped)
    && isMeasure(row.medianMs) && isMeasure(row.p90Ms) && isMeasure(row.maxMs) && (row.longTasks === null || isCount(row.longTasks))
    && isMeasure(row.longestTaskMs) && isMeasure(row.batteryPerHour)
    && (row.batteryGap === null || BATTERY_GAPS.includes(row.batteryGap as BatteryGap));
}

/** The sessions measured on this phone, newest first; whatever cannot be read is left out. */
export function readSessions(): SessionSummary[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.performance) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSummary).slice(0, PERFORMANCE_LIMITS.sessionsKept) : [];
  } catch {
    return [];
  }
}

/** Keeps a finished session; a storage failure only loses the figure, never the listening. */
export function saveSession(summary: SessionSummary): void {
  if (summary.analysed < PERFORMANCE_LIMITS.minWindowsToKeep) return;
  try {
    localStorage.setItem(STORAGE_KEYS.performance, JSON.stringify([summary, ...readSessions()].slice(0, PERFORMANCE_LIMITS.sessionsKept)));
  } catch {
    return;
  }
  for (const listener of [...listeners]) listener();
}

export function clearSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.performance);
  } catch {
    return;
  }
  for (const listener of [...listeners]) listener();
}

export function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener);
  const fromOtherTab = (event: StorageEvent): void => { if (event.key === STORAGE_KEYS.performance) listener(); };
  window.addEventListener('storage', fromOtherTab);
  return () => { listeners.delete(listener); window.removeEventListener('storage', fromOtherTab); };
}
