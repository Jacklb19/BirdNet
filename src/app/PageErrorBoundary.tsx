import { Component, type ReactNode } from 'react';
import { Button } from '../shared/ui/Button';
import { Notice } from '../shared/ui/Notice';

interface PageErrorBoundaryProps {
  readonly children: ReactNode;
  readonly message: string;
  readonly actionLabel: string;
}

/**
 * Keeps one failing screen (for example a chunk that could not be downloaded offline) from blanking the
 * whole app: navigation and the live player stay usable. Keyed by route so changing section resets it.
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="bn-shell__error">
        <Notice tone="error" icon="offline" action={<Button variant="quiet" onClick={() => { window.location.reload(); }}>{this.props.actionLabel}</Button>}>
          {this.props.message}
        </Notice>
      </div>
    );
  }
}
