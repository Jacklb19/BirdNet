/**
 * What this phone shows of its stores: only the signed-in person's records and walks (ADR-45). A shared phone keeps
 * another account's, unsent ones too, but never shows them; those recorded before accounts were required wait,
 * unseen, until an account accepts them. Without anyone signed in nothing is shown.
 */
export function ownedBy<T extends { readonly owner?: string | null }>(rows: readonly T[], userId: string | null): T[] {
  return userId ? rows.filter((row) => row.owner === userId) : [];
}
