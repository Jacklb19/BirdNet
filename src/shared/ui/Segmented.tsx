import { useRef, type KeyboardEvent } from 'react';
import './Segmented.css';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
}

/** Radio group with roving focus: arrows move and select, as in native segmented controls. */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>): React.JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent, index: number): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };
  return (
    <div className="bn-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button key={option.value} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" aria-checked={selected}
            tabIndex={selected ? 0 : -1} className="bn-segmented__option" onClick={() => { onChange(option.value); }} onKeyDown={(event) => { move(event, index); }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
