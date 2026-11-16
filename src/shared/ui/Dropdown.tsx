import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { usePopover } from './usePopover';
import './Popover.css';

export interface DropdownOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  /** A second, quieter line (the scientific name, a date). */
  readonly detail?: string;
  readonly disabled?: boolean;
  /** Language of the label when it differs from the page (language names in their own language). */
  readonly lang?: string;
}

export interface DropdownProps<T extends string> {
  /** Id of the visible label; the field is named by it. */
  readonly labelId: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  /**
   * `field`: a boxed form field. `row`: the value end of a settings row, quiet until pressed. `pill`: a rounded
   * control that floats over a map or sits in a toolbar.
   */
  readonly variant?: 'field' | 'row' | 'pill';
  /** Drawn before the value (the filter of the map, the pin of a place). */
  readonly icon?: IconName;
  /** Shown when the value matches no option (nothing chosen yet). */
  readonly placeholder?: string;
  readonly id?: string;
  /** Extra class of the wrapper, for a screen that tints the control (the dark pill of Listen). */
  readonly className?: string;
}

const enabledIndex = (options: readonly DropdownOption[], from: number, step: 1 | -1): number => {
  for (let index = from; index >= 0 && index < options.length; index += step) if (!options[index]?.disabled) return index;
  return -1;
};

/**
 * A list to choose one value from, drawn with Trino's tokens on every platform (ADR-47) instead of each system's own
 * picker. It follows the "select-only combobox" pattern of WAI-ARIA: the field keeps the focus, arrows move through
 * the options, Enter or Space chooses, Escape closes, Tab chooses the highlighted one and moves on, and typing a
 * letter jumps to the next option that starts with it. The list stays inside the visible area and scrolls.
 */
export function Dropdown<T extends string>({
  labelId, value, options, onChange, disabled = false, describedBy, variant = 'field', icon, placeholder, id, className,
}: DropdownProps<T>): React.JSX.Element {
  const ownId = useId();
  const fieldId = id ?? ownId;
  const listId = `${fieldId}-list`;
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = useCallback(() => { setOpen(false); }, []);
  const style = usePopover(open, wrapper, list, close, { width: variant === 'row' ? 'end' : 'field' });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const show = (index: number): void => {
    setActive(index);
    // Scrolled within the list only, so the page under it does not jump.
    requestAnimationFrame(() => { list.current?.querySelector<HTMLElement>(`[data-index="${String(index)}"]`)?.scrollIntoView({ block: 'nearest' }); });
  };
  const openList = (): void => {
    if (disabled) return;
    setOpen(true);
    show(selectedIndex >= 0 ? selectedIndex : enabledIndex(options, 0, 1));
  };
  const choose = (index: number): void => {
    const option = options[index];
    if (option && !option.disabled && option.value !== value) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(event.key)) { event.preventDefault(); openList(); }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => enabledIndex(options, active + 1, 1),
      ArrowUp: () => enabledIndex(options, active - 1, -1),
      Home: () => enabledIndex(options, 0, 1),
      End: () => enabledIndex(options, last, -1),
      PageDown: () => enabledIndex(options, Math.min(last, active + 10), 1),
      PageUp: () => enabledIndex(options, Math.max(0, active - 10), -1),
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); const next = move(); if (next >= 0) show(next); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return; }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { choose(active); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLocaleLowerCase();
      const order = options.map((_, index) => (active + 1 + index) % options.length);
      const match = order.find((index) => !options[index]?.disabled && options[index]?.label.toLocaleLowerCase().startsWith(letter));
      if (match !== undefined) show(match);
    }
  };

  return (
    <div ref={wrapper} className={['bn-dropdown', `bn-dropdown--${variant}`, className ?? ''].filter(Boolean).join(' ')}>
      <button type="button" id={fieldId} className="bn-dropdown__field" role="combobox" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={listId} aria-labelledby={`${labelId} ${fieldId}`} aria-describedby={describedBy}
        aria-activedescendant={open && active >= 0 ? `${listId}-${String(active)}` : undefined} disabled={disabled}
        onClick={() => { if (open) setOpen(false); else openList(); }} onKeyDown={onKeyDown} onBlur={(event) => {
          if (!wrapper.current?.contains(event.relatedTarget)) setOpen(false);
        }}>
        {icon && <span className="bn-dropdown__lead" aria-hidden="true"><Icon name={icon} size="s" /></span>}
        <span className={`bn-dropdown__value${selected ? '' : ' bn-dropdown__value--empty'}`} lang={selected?.lang}>{selected?.label ?? placeholder ?? ''}</span>
        <span className="bn-dropdown__chevron" aria-hidden="true"><Icon name="down" size="s" /></span>
      </button>
      {createPortal(<ul ref={list} id={listId} role="listbox" aria-labelledby={labelId} tabIndex={-1} hidden={!open} style={style}
        className="bn-popover bn-dropdown__list">
        {options.map((option, index) => (
          <li key={option.value} id={`${listId}-${String(index)}`} data-index={index} role="option" aria-selected={index === selectedIndex}
            aria-disabled={option.disabled || undefined} lang={option.lang}
            className={`bn-dropdown__option${index === active ? ' bn-dropdown__option--active' : ''}`}
            // Pressing must not move the focus off the field, or the list would close before the choice lands.
            onPointerDown={(event) => { event.preventDefault(); }} onClick={() => { choose(index); }}
            onPointerMove={() => { if (!option.disabled && active !== index) setActive(index); }}>
            <span className="bn-dropdown__check" aria-hidden="true">{index === selectedIndex && <Icon name="check" size="s" />}</span>
            <span className="bn-dropdown__text">
              <span>{option.label}</span>
              {option.detail && <span className="bn-dropdown__detail">{option.detail}</span>}
            </span>
          </li>
        ))}
      </ul>, document.body)}
    </div>
  );
}
