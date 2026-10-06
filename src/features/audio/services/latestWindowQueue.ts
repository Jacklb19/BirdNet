/** One active window and one pending window; overload replaces only the pending one. */
export class LatestWindowQueue<T> {
  private busy = false;
  private pending: T | null = null;

  constructor(
    private readonly dispatch: (window: T) => void,
    private readonly onDrop: () => void = () => undefined,
  ) {}

  public enqueue(window: T): void {
    if (this.busy) {
      if (this.pending !== null) this.onDrop();
      this.pending = window;
      return;
    }
    this.busy = true;
    this.dispatch(window);
  }

  /** Call once after the active window succeeds or fails. */
  public complete(): void {
    const next = this.pending;
    this.pending = null;
    this.busy = false;
    if (next !== null) this.enqueue(next);
  }

  /** Forget pending work when the owning worker is terminated. */
  public clear(): void {
    this.pending = null;
    this.busy = false;
  }
}
