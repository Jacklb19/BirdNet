/** Session-only deduplication survives navigation without retaining the previous account's species. */
export class WishlistNotices {
  private key = '';
  private readonly seen = new Set<string>();
  private match: string | null = null;
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot(owner: string | null, startedAt: number | null): string | null { return this.key === `${owner ?? ''}:${String(startedAt)}` ? this.match : null; }
  claim(owner: string, startedAt: number, detected: readonly string[], wished: ReadonlySet<string>): string[] {
    const key = `${owner}:${String(startedAt)}`;
    if (this.key !== key) { this.key = key; this.seen.clear(); this.match = null; }
    const added = detected.filter((species) => wished.has(species) && !this.seen.has(species));
    for (const species of added) this.seen.add(species);
    if (added[0]) { this.match = added[0]; for (const listener of this.listeners) listener(); }
    return added;
  }
  clear(): void { this.key = ''; this.seen.clear(); this.match = null; for (const listener of this.listeners) listener(); }
}
