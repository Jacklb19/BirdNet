/**
 * Which side of the account form a link asked for ("Sign in" or "Create account"). The hash already holds the
 * route, so the request travels in memory instead of a URL fragment the router would misread.
 */
export type SignInMode = 'signIn' | 'signUp';

let requested: SignInMode | null = null;
const listeners = new Set<() => void>();

/** Call right before following a link to the account screen; a form already on screen switches at once. */
export function requestSignInMode(mode: SignInMode): void {
  requested = mode;
  for (const listener of [...listeners]) listener();
}

/** The pending request, consumed once so a later visit starts on "Sign in" again. */
export function takeRequestedSignInMode(): SignInMode | null {
  const mode = requested;
  requested = null;
  return mode;
}

/** Tells an account form already on screen that a link asked for the other side. */
export function subscribeSignInMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
