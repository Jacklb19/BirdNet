import { describe, expect, it } from 'vitest';
import { followUp, type NameTable } from './followUp';
import { periodBounds, plan, planQuestion, validPlan } from './plan';

const names: NameTable = {
  'Turdus fuscater': ['Mirlo grande', 'Great Thrush'],
  'Zonotrichia capensis': ['Chingolo común', 'Rufous-collared Sparrow'],
  'Turdus flavipes': ['Mirlo azulado', 'Yellow-legged Thrush'],
};

describe('follow-ups resolved on the phone', () => {
  it('follows the conversation of the brief without calling the model', () => {
    const first = followUp('Muéstrame mis registros de esta semana', null, names);
    expect(first).toEqual({ kind: 'plan', plan: plan('detections', { period: { kind: 'relative', value: 'this_week' } }) });
    if (first.kind !== 'plan') throw new Error('expected a plan');
    const second = followUp('¿Y ayer?', first.plan, names);
    expect(second).toEqual({ kind: 'plan', plan: plan('detections', { period: { kind: 'relative', value: 'yesterday' } }) });
    if (second.kind !== 'plan') throw new Error('expected a plan');
    expect(followUp('Solo los provisionales', second.plan, names)).toEqual({ kind: 'plan', plan: { ...second.plan, review: 'pending' } });
    expect(followUp('Abre el primero', second.plan, names)).toEqual({ kind: 'open', index: 0 });
    expect(followUp('open the last one', second.plan, names)).toEqual({ kind: 'open', index: -1 });
    expect(followUp('Ver más', second.plan, names)).toEqual({ kind: 'more' });
    expect(followUp('Nueva consulta', second.plan, names)).toEqual({ kind: 'reset' });
  });

  it('understands English and full common or scientific names', () => {
    expect(followUp('show my songs of the great thrush last month', null, names)).toEqual({
      kind: 'plan', plan: plan('detections', { species: 'Turdus fuscater', period: { kind: 'relative', value: 'last_month' } }),
    });
    expect(followUp('especies de Zonotrichia capensis', null, names)).toEqual({ kind: 'plan', plan: plan('species', { species: 'Zonotrichia capensis' }) });
  });

  it('compares two periods, or the one on screen with another', () => {
    const weeks = plan('compare', { period: { kind: 'relative', value: 'this_week' }, compare_period: { kind: 'relative', value: 'last_week' } });
    expect(followUp('Compara esta semana con la semana pasada', null, names)).toEqual({ kind: 'plan', plan: weeks });
    expect(followUp('Esta semana frente a la semana pasada', null, names)).toEqual({ kind: 'plan', plan: weeks });
    expect(followUp('compara con el mes pasado', null, names)).toEqual({ kind: 'model' });
    const week = plan('detections', { period: { kind: 'relative', value: 'this_week' } });
    expect(followUp('compara contra la semana pasada', week, names)).toEqual({
      kind: 'plan', plan: plan('compare', { period: { kind: 'relative', value: 'this_week' }, compare_period: { kind: 'relative', value: 'last_week' } }),
    });
    expect(followUp('registros esta semana vs semana pasada', null, names)).toEqual({
      kind: 'plan', plan: plan('compare', { period: { kind: 'relative', value: 'this_week' }, compare_period: { kind: 'relative', value: 'last_week' } }),
    });
  });

  it('leaves to the model anything it does not fully understand', () => {
    // A private place, a partial name, an ambiguous name and a follow-up without anything on screen.
    expect(followUp('mis salidas en el humedal', null, names)).toEqual({ kind: 'model' });
    expect(followUp('registros del mirlo', null, names)).toEqual({ kind: 'model' });
    expect(followUp('¿Y ayer?', null, names)).toEqual({ kind: 'model' });
    expect(followUp('¿qué significa la confianza?', null, names)).toEqual({ kind: 'model' });
    // A filter that does not apply to what is on screen is not forced onto it.
    expect(followUp('solo los provisionales', plan('collections'), names)).toEqual({ kind: 'model' });
    expect(followUp('abre el primero de mi colección', null, names)).toEqual({ kind: 'model' });
    expect(followUp('Mis caminatas', null, names)).toEqual({ kind: 'model' });
    expect(followUp('My walks', null, names)).toEqual({ kind: 'model' });
  });
  it('keeps simple queries local before the optional common-name catalogue loads', () => {
    expect(followUp('Mis registros', null, null)).toEqual({ kind: 'plan', plan: plan('detections') });
    expect(followUp('Registros del mirlo grande', null, null)).toEqual({ kind: 'model' });
    expect(followUp('Aves que me interesan', null, null)).toEqual({ kind: 'plan', plan: plan('wishlist') });
    expect(followUp('Birds of interest', null, null)).toEqual({ kind: 'plan', plan: plan('wishlist') });
  });
});

describe('periods on this device', () => {
  // Wednesday 18 November 2026, mid-morning, local time.
  const now = new Date(2026, 10, 18, 10, 30);
  it('resolves calendar words as the API does: weeks from Monday, the end excluded', () => {
    expect(periodBounds({ kind: 'relative', value: 'this_week' }, now)).toEqual({ since: new Date(2026, 10, 16).toISOString(), until: new Date(2026, 10, 23).toISOString() });
    expect(periodBounds({ kind: 'relative', value: 'yesterday' }, now)).toEqual({ since: new Date(2026, 10, 17).toISOString(), until: new Date(2026, 10, 18).toISOString() });
    expect(periodBounds({ kind: 'relative', value: 'last_month' }, now)).toEqual({ since: new Date(2026, 9, 1).toISOString(), until: new Date(2026, 10, 1).toISOString() });
    expect(periodBounds({ kind: 'dates', first: '2026-01-31', last: '2026-02-01' }, now)).toEqual({ since: new Date(2026, 0, 31).toISOString(), until: new Date(2026, 1, 2).toISOString() });
    expect(periodBounds({ kind: 'all' }, now)).toEqual({ since: null, until: null });
  });

  it('builds only valid questions', () => {
    expect(planQuestion(plan('compare', { compare_period: { kind: 'relative', value: 'last_week' } }), 'es', 'America/Bogota', now)).toBeNull();
    expect(planQuestion(plan('collections', { review: 'pending' }), 'es', 'America/Bogota', now)).toBeNull();
    const question = planQuestion(plan('detections', { review: 'pending' }), 'en', 'America/Bogota', now);
    expect(question).toMatchObject({ intent: 'detections', review: 'pending', since: null, before: null, limit: 5 });
  });
  it('rejects invalid calendar dates instead of rolling them into another month', () => {
    for (const date of ['2026-02-29', '2026-13-01', '0000-01-01', '9999-12-31']) {
      expect(validPlan(plan('detections', { period: { kind: 'dates', first: date, last: date } }))).toBeNull();
    }
    const early = planQuestion(plan('detections', { period: { kind: 'dates', first: '0099-01-01', last: '0099-01-01' } }), 'es', 'UTC', now);
    expect(early && 'since' in early && early.since?.startsWith('0099-01-01')).toBe(true);
  });
});
