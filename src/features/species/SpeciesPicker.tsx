import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { usePopover } from '../../shared/ui/usePopover';
import { SPECIES_SEARCH_LIMIT, SPECIES_SEARCH_MIN_CHARS } from '../review/review.config';
import { searchSpecies, type SpeciesMatch } from '../review/speciesSearch';
import { commonName, useSpeciesNames } from './speciesNames';
import '../../shared/ui/Popover.css';
import './SpeciesPicker.css';

export interface SpeciesPickerProps {
  readonly label: string;
  /** The chosen species' scientific name, or '' while none is chosen. */
  readonly value: string;
  readonly onChange: (scientificName: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** Birds expected at the place, listed first. */
  readonly likely?: ReadonlySet<string>;
  readonly hint?: string;
}

/**
 * Search the catalogue by common or scientific name and choose one species (ADR-47). It is an editable combobox
 * (WAI-ARIA): typing filters a short list, arrows move through it, Enter chooses, Escape closes. Only a species of
 * the catalogue can be chosen, so the value is always a canonical scientific name; typed text that matches none is
 * reported on sending, not stored. The list never holds more than a few birds and scrolls inside the visible area.
 */
export function SpeciesPicker({ label, value, onChange, required = false, disabled = false, likely, hint }: SpeciesPickerProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.common.controls.species;
  const names = useSpeciesNames();
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // What the person is typing while no species is chosen; once one is, the field shows its name, which follows the
  // language and the catalogue loading later, and any value set from outside (a saved record, a cleared form).
  const [text, setText] = useState('');
  const shown = value ? commonName(names, value, locale) : text;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = useCallback(() => { setOpen(false); }, []);
  const style = usePopover(open, wrapper, list, close);

  const matches: SpeciesMatch[] = names && open ? searchSpecies(names, text, locale, SPECIES_SEARCH_LIMIT, likely) : [];
  const tooShort = text.trim().length < SPECIES_SEARCH_MIN_CHARS;

  // Typed text that is not a chosen species makes the form invalid, with a message the browser shows on sending.
  useEffect(() => {
    input.current?.setCustomValidity(text.trim() && !value ? texts.chooseFromList : '');
  }, [text, value, texts.chooseFromList]);

  const choose = (match: SpeciesMatch): void => {
    onChange(match.scientificName);
    setText('');
    setOpen(false);
  };
  const type = (next: string): void => {
    // Editing a chosen name starts a new search from what is now in the field.
    setText(next);
    setOpen(true);
    setActive(-1);
    if (value) onChange('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!matches.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter' && open && active >= 0) {
      const match = matches[active];
      if (match) { event.preventDefault(); choose(match); }
      return;
    }
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
  };

  let note: string | null = null;
  if (open && !names) note = dict.common.loading;
  else if (open && tooShort) note = texts.keepTyping;
  else if (open && !matches.length) note = texts.noMatches;

  return (
    <div className="bn-species-picker">
      <label htmlFor={id} className="bn-species-picker__label">{label}</label>
      <div ref={wrapper} className="bn-species-picker__box">
        <Icon name="search" size="s" />
        <input ref={input} id={id} className="bn-species-picker__input" role="combobox" aria-autocomplete="list" aria-expanded={open}
          aria-controls={listId} aria-activedescendant={open && active >= 0 ? `${listId}-${String(active)}` : undefined}
          aria-describedby={[hint ? hintId : '', value ? `${id}-chosen` : ''].filter(Boolean).join(' ') || undefined}
          value={shown} required={required} disabled={disabled} autoComplete="off" spellCheck={false} placeholder={texts.placeholder}
          onChange={(event) => { type(event.target.value); }} onFocus={() => { if (!value) setOpen(true); }} onKeyDown={onKeyDown}
          onBlur={(event) => { if (!wrapper.current?.contains(event.relatedTarget)) setOpen(false); }} />
        {shown && !disabled && (
          <button type="button" className="bn-species-picker__clear" aria-label={texts.clear}
            onClick={() => { type(''); input.current?.focus(); }}>
            <Icon name="close" size="s" />
          </button>
        )}
      </div>
      {value && <p id={`${id}-chosen`} className="bn-species-picker__chosen">{value}</p>}
      {hint && <p id={hintId} className="bn-species-picker__hint">{hint}</p>}
      {createPortal(
        <div ref={list} className="bn-popover bn-species-picker__popover" hidden={!open} style={style}>
          <ul id={listId} role="listbox" aria-label={label} className="bn-species-picker__list">
            {matches.map((match, index) => (
              <li key={match.scientificName} id={`${listId}-${String(index)}`} role="option" aria-selected={match.scientificName === value}
                className={`bn-dropdown__option${index === active ? ' bn-dropdown__option--active' : ''}`}
                onPointerDown={(event) => { event.preventDefault(); }} onClick={() => { choose(match); }}
                onPointerMove={() => { if (active !== index) setActive(index); }}>
                <span className="bn-dropdown__text">
                  <span>{match.name}</span>
                  <span className="bn-dropdown__detail">{match.scientificName}</span>
                </span>
              </li>
            ))}
          </ul>
          {note && <p className="bn-popover__note" role="status">{note}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
