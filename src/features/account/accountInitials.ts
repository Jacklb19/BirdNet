/** Letters shown in the avatar; the account only has an e-mail, so they come from its local part. */
const MAX_INITIALS = 2;
const NAME_SEPARATORS = /[._\-+]+/;
// Graphemes, not code units, so accented or composed letters are never split in half.
const graphemes = (text: string): string[] => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);

export function accountInitials(email: string | null): string | null {
  const local = email?.split('@')[0]?.trim();
  if (!local) return null;
  const parts = local.split(NAME_SEPARATORS).filter(Boolean);
  const letters = parts.length > 1 ? parts.map((part) => graphemes(part)[0] ?? '') : graphemes(local);
  return letters.slice(0, MAX_INITIALS).join('').toLocaleUpperCase();
}
