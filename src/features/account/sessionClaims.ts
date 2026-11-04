/** What the app reads from its own access token, without checking the signature: the server does, this only decides what to show. */

export function claimsOf(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const claims: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
    return typeof claims === 'object' && claims !== null ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * When the person last proved who they are in this session (password, Google, e-mail code or authenticator app), in
 * epoch milliseconds: the latest time in the `amr` claim, which refreshing the token keeps. Null when it names none.
 */
export function signedInAt(token: string): number | null {
  const methods = claimsOf(token)?.amr;
  if (!Array.isArray(methods)) return null;
  const times = methods.map((method: unknown) => (typeof method === 'object' && method !== null ? (method as { timestamp?: unknown }).timestamp : null))
    .filter((moment): moment is number => typeof moment === 'number' && Number.isInteger(moment));
  return times.length > 0 ? Math.max(...times) * 1000 : null;
}
