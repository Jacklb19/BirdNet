import { describe, expect, it } from 'vitest';
import { dictionaries } from '../../i18n';
import type { ModelState } from '../offline/useModel';
import { heardAgoText } from './listenFormat';
import { heardAgo, listPhase, sessionPhase, showsSessionError, startBlocker } from './listenState';

const MINUTE = 60_000;

describe('heard ago', () => {
  const at = 10 * 60 * MINUTE;

  it('says a current singer is singing now, whatever the clock says', () => {
    expect(heardAgo(at - 5 * MINUTE, at, true)).toEqual({ unit: 'now' });
  });

  it('buckets into a moment, whole minutes and whole hours', () => {
    expect(heardAgo(at - 59_999, at, false)).toEqual({ unit: 'moment' });
    expect(heardAgo(at - MINUTE, at, false)).toEqual({ unit: 'minutes', value: 1 });
    expect(heardAgo(at - 59 * MINUTE - 59_999, at, false)).toEqual({ unit: 'minutes', value: 59 });
    expect(heardAgo(at - 60 * MINUTE, at, false)).toEqual({ unit: 'hours', value: 1 });
    expect(heardAgo(at - 150 * MINUTE, at, false)).toEqual({ unit: 'hours', value: 2 });
  });

  it('reads a window newer than the refreshed clock as a moment ago', () => {
    expect(heardAgo(at + 5_000, at, false)).toEqual({ unit: 'moment' });
  });

  it('formats each bucket with its own text and a localized number', () => {
    expect(heardAgoText({ unit: 'now' }, 'es', dictionaries.es.listen)).toBe('canta ahora');
    expect(heardAgoText({ unit: 'minutes', value: 2 }, 'es', dictionaries.es.listen)).toBe('hace 2 min');
    expect(heardAgoText({ unit: 'hours', value: 1 }, 'en', dictionaries.en.listen)).toBe('1 h ago');
  });
});

describe('species summary', () => {
  it('waits while listening without species and keeps the last session after stopping', () => {
    expect(listPhase(true, 0)).toBe('waiting');
    expect(listPhase(true, 3)).toBe('live');
    expect(listPhase(false, 3)).toBe('last');
    expect(listPhase(false, 0)).toBe('hidden');
  });
});

describe('session phase', () => {
  const base = { active: true, sessionError: null, modelStatus: 'loading', captureState: 'idle' } as const;

  it('follows the start sequence: model, microphone, listening', () => {
    expect(sessionPhase({ ...base, active: false, modelStatus: 'idle' })).toBe('idle');
    expect(sessionPhase(base)).toBe('preparingModel');
    expect(sessionPhase({ ...base, modelStatus: 'ready', captureState: 'requesting_permission' })).toBe('waitingMicrophone');
    expect(sessionPhase({ ...base, modelStatus: 'ready', captureState: 'listening' })).toBe('listening');
  });

  it('reports an error even after the failed session stopped', () => {
    expect(sessionPhase({ ...base, active: false, sessionError: 'audio', captureState: 'error' })).toBe('error');
  });

  it('lets people start only when the model is usable, and says why not otherwise', () => {
    const usable: ModelState[] = ['unmanaged', 'ready', 'error'];
    expect(usable.map(startBlocker)).toEqual([null, null, null]);
    expect((['checking', 'downloading', 'missing'] as const).map(startBlocker)).toEqual(['checking', 'downloading', 'needsModel']);
  });

  it('shows a model failure once: the model notice explains a missing model or a failed check', () => {
    expect(showsSessionError('model', 'missing')).toBe(false);
    expect(showsSessionError('model', 'error')).toBe(false);
    expect(showsSessionError('model', 'ready')).toBe(true);
    expect(showsSessionError('storage', 'missing')).toBe(true);
    expect(showsSessionError(null, 'ready')).toBe(false);
  });
});
