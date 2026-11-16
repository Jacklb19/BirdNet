import { useCallback, useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { useSheetLayout } from './sheetLayout';
import './MapSheet.css';

export interface SheetShellProps {
  readonly ref?: Ref<HTMLElement>;
  readonly title: string;
  /** Short state next to the title (a refresh in progress). */
  readonly aside?: ReactNode;
  /** One line under the title, announced politely when it changes. */
  readonly summary: string;
  readonly busy?: boolean;
  /** Only a list can be enlarged. */
  readonly expandable: boolean;
  /** Enlarged over the map (phones). The screen owns it, because every new view returns the sheet to its height. */
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly children: ReactNode;
}

/** How far the handle must travel, in CSS pixels, to count as a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 24;
/** Share of the screen height past which a swipe moves the sheet two heights at once. */
const LONG_SWIPE_SHARE = 0.35;

type Height = 'collapsed' | 'normal' | 'expanded';

/**
 * The panel over the map: bottom sheet on phones, side panel on wide screens. Its content is the caller's (ADR-47).
 * On a phone the handle moves it, as sheets do: dragged up it grows, dragged down it folds to its title, and a tap
 * unfolds it or toggles its size; the arrow keys do the same from the keyboard. Wide screens fold it with a button.
 */
export function SheetShell({ ref, title, aside, summary, busy = false, expandable, expanded, onExpandedChange, children }: SheetShellProps): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.map.sheet;
  const { collapsed, setCollapsed } = useSheetLayout();
  const titleId = useId();
  const bodyId = useId();
  const sheet = useRef<HTMLElement | null>(null);
  const drag = useRef<{ readonly y: number; readonly height: number; moved: boolean } | null>(null);
  const height: Height = collapsed ? 'collapsed' : expanded && expandable ? 'expanded' : 'normal';

  const setRefs = useCallback((node: HTMLElement | null): void => {
    sheet.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const moveTo = (next: Height): void => {
    setCollapsed(next === 'collapsed');
    onExpandedChange(next === 'expanded');
  };
  const step = (direction: 1 | -1, steps = 1): void => {
    const order: Height[] = expandable ? ['collapsed', 'normal', 'expanded'] : ['collapsed', 'normal'];
    const next = order[Math.min(order.length - 1, Math.max(0, order.indexOf(height) + direction * steps))];
    if (next) moveTo(next);
  };
  const tap = (): void => {
    if (height === 'collapsed') moveTo('normal');
    else if (expandable) moveTo(height === 'expanded' ? 'normal' : 'expanded');
    else moveTo('collapsed');
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    const node = sheet.current;
    if (!node) return;
    // Captured so the drag keeps reaching the handle when the finger leaves it; a pointer the browser no longer
    // tracks cannot be captured, and the drag still works while it stays over the handle.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Not capturable: see above. */ }
    drag.current = { y: event.clientY, height: node.getBoundingClientRect().height, moved: false };
    node.classList.add('bn-map-sheet--dragging');
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const start = drag.current; const node = sheet.current;
    if (!start || !node) return;
    const delta = start.y - event.clientY;
    if (Math.abs(delta) > DRAG_THRESHOLD_PX) start.moved = true;
    // The sheet follows the finger while it is held; letting go settles it at one of its heights.
    if (start.moved) node.style.height = `${String(Math.max(0, start.height + delta))}px`;
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const start = drag.current; const node = sheet.current;
    drag.current = null;
    if (!start || !node) return;
    node.classList.remove('bn-map-sheet--dragging');
    node.style.height = '';
    if (!start.moved) { tap(); return; }
    const delta = start.y - event.clientY;
    // A long swipe goes all the way: from enlarged straight to folded, or from folded straight to enlarged.
    step(delta > 0 ? 1 : -1, Math.abs(delta) > window.innerHeight * LONG_SWIPE_SHARE ? 2 : 1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowUp') { event.preventDefault(); step(1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); step(-1); }
  };

  const classes = ['bn-map-sheet', height === 'expanded' ? 'bn-map-sheet--expanded' : '', collapsed ? 'bn-map-sheet--collapsed' : ''].filter(Boolean).join(' ');
  return (
    <section ref={setRefs} className={classes} aria-labelledby={titleId}>
      {/* A click is handled on pointer release, so a drag is never also read as a tap. */}
      <button type="button" className="bn-map-sheet__grabber" aria-controls={bodyId} aria-label={texts.handle[height]} title={texts.handle[height]}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; sheet.current?.classList.remove('bn-map-sheet--dragging'); if (sheet.current) sheet.current.style.height = ''; }}
        onClick={(event) => { if (event.detail === 0) tap(); }} onKeyDown={onKeyDown}>
        <span className="bn-map-sheet__handle" />
      </button>
      <header className="bn-map-sheet__header">
        <div className="bn-map-sheet__heading">
          <h2 id={titleId} className="bn-map-sheet__title">{title}</h2>
          {aside}
          <button type="button" className="bn-map-sheet__fold" aria-expanded={!collapsed} aria-controls={bodyId}
            onClick={() => { moveTo(collapsed ? 'normal' : 'collapsed'); }}>
            <Icon name="down" size="s" />
            <span>{collapsed ? texts.unfold : texts.fold}</span>
          </button>
        </div>
        <p className="bn-map-sheet__summary" aria-live="polite">{summary}</p>
      </header>
      <div id={bodyId} className="bn-map-sheet__body" aria-busy={busy} hidden={collapsed}>{children}</div>
    </section>
  );
}
