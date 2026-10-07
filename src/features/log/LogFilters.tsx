import { useRef, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n';
import { LOG_FILTERS, type LogFilter } from './logRecords';
import './LogFilters.css';

export interface LogFiltersProps {
  readonly value: LogFilter;
  readonly onChange: (filter: LogFilter) => void;
}

const STEP_BY_KEY: Readonly<Record<string, number>> = Object.freeze({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 });

/** Filter chips: one radio group with roving focus, so arrows move between them and Tab leaves the group. */
export function LogFilters({ value, onChange }: LogFiltersProps): React.JSX.Element {
  const { dict } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number): void => {
    const filter = LOG_FILTERS[index];
    if (!filter) return;
    onChange(filter);
    refs.current[index]?.focus();
  };

  const move = (event: KeyboardEvent, index: number): void => {
    const last = LOG_FILTERS.length - 1;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    const step = STEP_BY_KEY[event.key];
    if (target === null && step === undefined) return;
    event.preventDefault();
    select(target ?? (index + (step ?? 0) + LOG_FILTERS.length) % LOG_FILTERS.length);
  };

  return (
    <div className="bn-log-filters" role="radiogroup" aria-label={dict.log.filters.label}>
      {LOG_FILTERS.map((filter, index) => {
        const checked = filter === value;
        return (
          <button key={filter} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" aria-checked={checked}
            tabIndex={checked ? 0 : -1} className="bn-log-filters__chip" onClick={() => { onChange(filter); }} onKeyDown={(event) => { move(event, index); }}>
            {dict.log.filters.options[filter]}
          </button>
        );
      })}
    </div>
  );
}
