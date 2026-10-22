import { describe, expect, it } from 'vitest';
import { parseReferenceSounds, soundKind } from './referenceSounds';

const sound = (changes: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'XC694038', type: 'song', length_seconds: 24, country: 'Colombia', recordist: 'Ana Pérez', quality: 'A',
  license: { code: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  page_url: 'https://xeno-canto.org/694038', audio_url: 'https://xeno-canto.org/694038/download', ...changes,
});

describe('reference sounds', () => {
  it('keeps the credits and plays only from xeno-canto', () => {
    const parsed = parseReferenceSounds({ species: 'Turdus fuscater', source: 'xeno-canto', restricted: false, sounds: [
      sound(), sound({ id: 'XC2', audio_url: 'https://evil.example/2.mp3' }), sound({ id: 'XC3', license: { code: 'CC BY 4.0', url: 'https://example.org/l' } }),
      sound({ id: 'XC4', recordist: ' ' }), sound({ id: 'XC5', country: null }),
    ] });
    expect(parsed.sounds.map((item) => item.id)).toEqual(['XC694038', 'XC5']);
    expect(parsed.sounds[0]).toMatchObject({ recordist: 'Ana Pérez', license: { code: 'CC BY-NC-SA 4.0' }, lengthSeconds: 24 });
  });

  it('rejects an answer that is not one', () => {
    expect(() => parseReferenceSounds({ sounds: [] })).toThrow();
    expect(parseReferenceSounds({ restricted: true, sounds: [] })).toEqual({ restricted: true, sounds: [] });
  });

  it('reduces xeno-canto types to song, call or other sound', () => {
    expect(soundKind('song')).toBe('song');
    expect(soundKind('call, song')).toBe('song');
    expect(soundKind('flight call')).toBe('call');
    expect(soundKind('drumming')).toBe('other');
  });
});
