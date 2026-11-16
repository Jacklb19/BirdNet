import { passwordsMatch } from './account.constants';

/**
 * What a new password meets while it is typed. The requirements are the ones the server enforces (its minimum
 * length) plus typing it twice the same; the suggestions only make it harder to guess and never block the form.
 */
export interface PasswordGuidance {
  /** Required: at least the minimum length, counted in characters as the person sees them. */
  readonly longEnough: boolean;
  /** Required: both fields hold the same password; null while the confirmation is still empty. */
  readonly matches: boolean | null;
  /** Suggested: comfortably longer than the minimum. */
  readonly roomy: boolean;
  /** Suggested: letters mixed with digits or symbols. */
  readonly varied: boolean;
}

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
const OTHER = /[^\p{L}\p{N}\s]/u;

export function passwordGuidance(password: string, confirmation: string, minLength: number, roomyLength: number): PasswordGuidance {
  const length = Array.from(password).length;
  const kinds = [LETTER, DIGIT, OTHER].filter((kind) => kind.test(password)).length;
  return {
    longEnough: length >= minLength,
    matches: confirmation === '' ? null : passwordsMatch(password, confirmation),
    roomy: length >= roomyLength,
    varied: LETTER.test(password) && kinds >= 2,
  };
}
