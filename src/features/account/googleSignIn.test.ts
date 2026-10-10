// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nonceWithHash, wasDismissed } from './googleSignIn';

describe('Google sign-in through the browser chooser', () => {
  it('gives Google the SHA-256 of the nonce and keeps the original for Supabase', async () => {
    const first = await nonceWithHash();
    expect(first.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hashed).toBe(createHash('sha256').update(first.nonce).digest('hex'));
    expect((await nonceWithHash()).nonce).not.toBe(first.nonce);
  });

  it('tells a closed chooser apart from a chooser that could not work', () => {
    expect(wasDismissed(new DOMException('The user closed the dialog.', 'NotAllowedError'))).toBe(true);
    expect(wasDismissed(new DOMException('Aborted.', 'AbortError'))).toBe(true);
    // A network or configuration failure must fall back to the redirect instead of doing nothing.
    expect(wasDismissed(new DOMException('Config unreachable.', 'NetworkError'))).toBe(false);
    expect(wasDismissed(new Error('No Google credential.'))).toBe(false);
  });
});
