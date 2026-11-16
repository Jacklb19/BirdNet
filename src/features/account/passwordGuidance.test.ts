import { describe, expect, it } from 'vitest';
import { passwordGuidance } from './passwordGuidance';

describe('password guidance', () => {
  it('requires only the server minimum and a matching confirmation', () => {
    expect(passwordGuidance('abcdefg', '', 8, 12)).toEqual({ longEnough: false, matches: null, roomy: false, varied: false });
    // A long password of letters alone meets every requirement; the suggestions never block it.
    expect(passwordGuidance('abcdefgh', 'abcdefgh', 8, 12)).toMatchObject({ longEnough: true, matches: true, varied: false });
    expect(passwordGuidance('abcdefgh', 'abcdefgx', 8, 12).matches).toBe(false);
  });

  it('counts characters as the person sees them, not UTF-16 units', () => {
    // Seven emoji are fourteen code units: still below a minimum of eight characters.
    expect(passwordGuidance('🐦🐦🐦🐦🐦🐦🐦', '', 8, 12).longEnough).toBe(false);
    expect(passwordGuidance('añoñoñoñ', '', 8, 12).longEnough).toBe(true);
  });

  it('suggests length and variety separately from the requirements', () => {
    expect(passwordGuidance('mirlo grande del parque', '', 8, 12)).toMatchObject({ roomy: true, varied: false });
    expect(passwordGuidance('mirlo2024', '', 8, 12)).toMatchObject({ roomy: false, varied: true });
    expect(passwordGuidance('mirlo!', '', 8, 12).varied).toBe(true);
    // Digits and symbols without a letter are not the mix the suggestion describes.
    expect(passwordGuidance('12345678!', '', 8, 12).varied).toBe(false);
  });
});
