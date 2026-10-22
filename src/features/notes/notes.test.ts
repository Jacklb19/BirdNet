import { describe, expect, it } from 'vitest';
import { NOTE_LIMITS } from '../../config/contract';
import { cleanNote, isValidNote, notePayload } from './notePolicy';

describe('notes', () => {
  it('trims what is typed and treats a blank note as none, as the API does', () => {
    expect(cleanNote('  dos machos \n')).toBe('dos machos');
    expect(cleanNote(' \n ')).toBeNull();
  });

  it('stores only notes the API would take', () => {
    expect(isValidNote({ note: 'canto al alba', individuals: 2 })).toBe(true);
    expect(isValidNote({ note: null, individuals: null })).toBe(true);
    expect(isValidNote({ note: 'x'.repeat(NOTE_LIMITS.noteLength + 1), individuals: null })).toBe(false);
    expect(isValidNote({ note: ' padded ', individuals: null })).toBe(false);
    expect(isValidNote({ note: null, individuals: 0 })).toBe(false);
    expect(isValidNote({ note: null, individuals: NOTE_LIMITS.maxIndividuals + 1 })).toBe(false);
    expect(isValidNote({ note: null, individuals: 1.5 })).toBe(false);
  });

  it('sends the whole note, so a repeated request changes nothing', () => {
    expect(notePayload({ note: 'x', individuals: null })).toEqual({ note: 'x', individuals: null });
  });
});
