import { useId, type ReactNode, type Ref } from 'react';
import { useI18n } from '../../i18n';
import './MapSheet.css';

export interface SheetShellProps {
  readonly ref?: Ref<HTMLElement>;
  readonly title: string;
  /** Short state next to the title (a refresh in progress). */
  readonly aside?: ReactNode;
  /** One line under the title, announced politely when it changes. */
  readonly summary: string;
  readonly busy?: boolean;
  /** Only a list can be enlarged; without one there is no grabber. */
  readonly expandable: boolean;
  /** Enlarged over the map (phones). The screen owns it, because every new view returns the sheet to its height. */
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly children: ReactNode;
}

/** The panel over the map: bottom sheet on phones, side panel on wide screens. Its content is the caller's. */
export function SheetShell({ ref, title, aside, summary, busy = false, expandable, expanded, onExpandedChange, children }: SheetShellProps): React.JSX.Element {
  const { dict } = useI18n();
  const titleId = useId();
  const bodyId = useId();
  return (
    <section ref={ref} className={`bn-map-sheet${expanded ? ' bn-map-sheet--expanded' : ''}`} aria-labelledby={titleId}>
      {expandable && (
        <button type="button" className="bn-map-sheet__grabber" aria-pressed={expanded} aria-controls={bodyId}
          aria-label={dict.map.sheet.expand} title={dict.map.sheet.expand} onClick={() => { onExpandedChange(!expanded); }}>
          <span className="bn-map-sheet__handle" />
        </button>
      )}
      <header className="bn-map-sheet__header">
        <div className="bn-map-sheet__heading">
          <h2 id={titleId} className="bn-map-sheet__title">{title}</h2>
          {aside}
        </div>
        <p className="bn-map-sheet__summary" aria-live="polite">{summary}</p>
      </header>
      <div id={bodyId} className="bn-map-sheet__body" aria-busy={busy}>{children}</div>
    </section>
  );
}
