import { describe, expect, it } from 'vitest';
import { dictionaries } from '../../i18n/allMessages';
import { reportLines, reportText } from '../settings/performanceReport';
import { droppedShare, percentile, recordSession } from './sessionMetrics';

const START = Date.UTC(2026, 9, 22, 6, 0);
const MINUTE = 60_000;

describe('session metrics', () => {
  it('summarizes the time per window with median, p90 and maximum', () => {
    const recorder = recordSession(START, true);
    recorder.model('birdnet-v2.4:int8+birdnet-plus-v3.0');
    for (const latency of [400, 380, 1200, 420, 410, 390, 405, 395, 415, 900]) recorder.analysed(latency);
    recorder.analysed(Number.NaN);
    recorder.dropped(2);
    recorder.longTask(72);
    recorder.longTask(55);
    const summary = recorder.finish(START + 20 * MINUTE);
    expect(summary).toMatchObject({ analysed: 10, dropped: 2, medianMs: 405, p90Ms: 900, maxMs: 1200, longTasks: 2, longestTaskMs: 72, durationSeconds: 1200 });
    expect(droppedShare(summary)).toBeCloseTo(2 / 12);
  });

  it('gives battery per hour only when it is honest to', () => {
    const measured = recordSession(START, false);
    measured.analysed(300);
    measured.battery({ level: 0.9, charging: false });
    measured.battery({ level: 0.85, charging: false });
    const hour = measured.finish(START + 30 * MINUTE);
    expect(hour.batteryPerHour).toBeCloseTo(10);
    expect(hour.longTasks).toBeNull();

    const charging = recordSession(START, false);
    charging.battery({ level: 0.5, charging: false });
    charging.battery({ level: 0.6, charging: true });
    expect(charging.finish(START + 30 * MINUTE)).toMatchObject({ batteryPerHour: null, batteryGap: 'charging' });

    const short = recordSession(START, false);
    short.battery({ level: 0.5, charging: false });
    expect(short.finish(START + 5 * MINUTE)).toMatchObject({ batteryPerHour: null, batteryGap: 'short' });
    expect(recordSession(START, false).finish(START + 30 * MINUTE).batteryGap).toBe('unsupported');
  });

  it('takes the nearest rank as percentile', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([10], 0.9)).toBe(10);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  });
});

describe('performance report', () => {
  const texts = dictionaries.es.settings.performance;
  const summary = { ...recordSession(START, true).finish(START + 62 * MINUTE), analysed: 2480, dropped: 0, medianMs: 480, p90Ms: 620, maxMs: 1600,
    longTasks: 0, longestTaskMs: null, batteryPerHour: 14, batteryGap: null, model: 'birdnet-v2.4:int8' };

  it('compares each figure with its target of the specification', () => {
    const lines = reportLines(summary, texts, 'es');
    expect(lines.map((line) => line.met)).toEqual([null, false, true, true, true]);
  });

  it('copies a plain text with the device and every session', () => {
    const text = reportText([summary, summary], texts, 'es', { cores: 8, memoryGb: 4 }, 'Mozilla/5.0 (Linux; Android 14)');
    expect(text.split('\n')[0]).toBe(texts.reportTitle);
    expect(text).toContain('Mozilla/5.0 (Linux; Android 14)');
    expect(text).toContain('RNF-01');
    expect(text.match(/RNF-04/g)).toHaveLength(2);
  });
});
