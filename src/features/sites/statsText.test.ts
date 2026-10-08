import { describe, expect, it } from 'vitest';
import { dictionaries } from '../../i18n';
import { cardChangeText, spokenChangeText } from './statsText';

const es = dictionaries.es.sites;
const en = dictionaries.en.sites;

describe('species change on a site card', () => {
  it('says nothing when there is no previous period to compare with', () => {
    expect(cardChangeText({ kind: 'unknown' }, 'all', es, 'es')).toBeNull();
    expect(spokenChangeText({ kind: 'unknown' }, 'all', es, 'es')).toBeNull();
  });

  it('shows the signed change of the period, or that nothing changed', () => {
    expect(cardChangeText({ kind: 'change', delta: 3 }, 'month', es, 'es')).toBe('+3 este mes');
    expect(cardChangeText({ kind: 'same' }, 'month', es, 'es')).toBe(es.noChange);
  });

  it('reads the change in full, with the species unit and its plural', () => {
    expect(spokenChangeText({ kind: 'change', delta: 3 }, 'month', es, 'es')).toBe('3 especies más que el mes anterior');
    expect(spokenChangeText({ kind: 'change', delta: -1 }, 'week', es, 'es')).toBe('1 especie menos que la semana anterior');
    expect(spokenChangeText({ kind: 'change', delta: -2 }, 'month', en, 'en')).toBe('2 fewer species than the previous month');
  });
});
