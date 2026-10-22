/**
 * How one measured session reads, line by line, for "Rendimiento de este teléfono" and the summary the person copies:
 * each figure with the target of the specification it is evidence for.
 */
import { formatDate, formatMilliseconds, formatMinutes, formatNumber, formatPercent, type Locale, type Messages } from '../../i18n';
import { PERFORMANCE_TARGETS } from '../performance/performance.config';
import { droppedShare, type SessionSummary } from '../performance/sessionMetrics';

type Texts = Messages['settings']['performance'];

export interface ReportLine {
  readonly label: string;
  readonly value: string;
  readonly target: string;
  /** Null when there is nothing to compare (not measured by this browser). */
  readonly met: boolean | null;
}

const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

/** What the browser says about the phone, to tell field reports apart; read when the summary is made. */
export interface DeviceFacts {
  readonly cores: number | null;
  /** Approximate memory in GB (Device Memory API, Chrome only). */
  readonly memoryGb: number | null;
}

export function sessionTitle(summary: SessionSummary, texts: Texts, locale: Locale): string {
  const minutes = Math.max(1, Math.round(summary.durationSeconds / SECONDS_PER_MINUTE));
  return texts.session(formatDate(new Date(summary.startedAt), locale), formatMinutes(minutes, locale));
}

export function reportLines(summary: SessionSummary, texts: Texts, locale: Locale): ReportLine[] {
  const ms = (value: number | null): string => (value === null ? '—' : formatMilliseconds(value, locale, 0));
  const share = droppedShare(summary) ?? 0;
  const lines: ReportLine[] = [
    { label: texts.model, value: summary.model ?? texts.noModel, target: '', met: null },
    {
      label: texts.perWindow, value: texts.perWindowValue(ms(summary.medianMs), ms(summary.p90Ms), ms(summary.maxMs)),
      target: texts.targets.perWindow(formatMilliseconds(PERFORMANCE_TARGETS.windowMs, locale, 0)),
      met: summary.maxMs === null ? null : summary.maxMs < PERFORMANCE_TARGETS.windowMs,
    },
    {
      label: texts.lost,
      value: texts.lostValue(formatNumber(summary.dropped, locale), formatPercent(share, locale, 1), formatNumber(summary.analysed + summary.dropped, locale)),
      target: texts.targets.lost, met: share <= PERFORMANCE_TARGETS.droppedShare,
    },
    {
      label: texts.longTasks,
      value: summary.longTasks === null ? texts.notMeasured
        : summary.longTasks === 0 ? texts.noLongTasks : texts.longTasksValue(formatNumber(summary.longTasks, locale), ms(summary.longestTaskMs)),
      target: texts.targets.longTasks(formatMilliseconds(PERFORMANCE_TARGETS.longTaskMs, locale, 0)),
      met: summary.longTasks === null ? null : summary.longTasks === 0,
    },
    {
      label: texts.battery,
      value: summary.batteryPerHour === null
        ? texts.gaps[summary.batteryGap ?? 'unsupported']
        : texts.batteryValue(formatPercent(summary.batteryPerHour / PERCENT, locale, 1)),
      target: texts.targets.battery(formatPercent(PERFORMANCE_TARGETS.batteryPerHour / PERCENT, locale, 0)),
      met: summary.batteryPerHour === null ? null : summary.batteryPerHour < PERFORMANCE_TARGETS.batteryPerHour,
    },
  ];
  return lines;
}

export function deviceLine(device: DeviceFacts, texts: Texts, locale: Locale): string | null {
  if (device.cores === null) return null;
  const cores = formatNumber(device.cores, locale);
  return device.memoryGb === null ? texts.deviceUnknownMemory(cores) : texts.device(cores, `${formatNumber(device.memoryGb, locale)} GB`);
}

/** Plain text of the sessions, newest first, as the person pastes it in a message or a field report. */
export function reportText(sessions: readonly SessionSummary[], texts: Texts, locale: Locale, device: DeviceFacts, userAgent: string): string {
  const blocks = sessions.map((summary) => [
    sessionTitle(summary, texts, locale),
    ...reportLines(summary, texts, locale).map((line) => {
      const verdict = line.met === null ? '' : ` · ${line.met ? texts.met : texts.missed}`;
      return line.target ? `${line.label}: ${line.value} (${texts.target(line.target)}${verdict})` : `${line.label}: ${line.value}`;
    }),
  ].join('\n'));
  return [texts.reportTitle, deviceLine(device, texts, locale), userAgent, '', blocks.join('\n\n')].filter((line) => line !== null).join('\n');
}
