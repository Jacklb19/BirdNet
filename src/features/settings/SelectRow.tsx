import { useId } from 'react';
import { Icon } from '../../shared/ui/Icon';
import './SelectRow.css';

export interface SelectRowOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Language of the label when it differs from the page (language names in their own language). */
  readonly lang?: string;
}

export interface SelectRowProps {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly options: readonly SelectRowOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/** A settings row whose value is picked from a native list, which phones show with their own accessible picker. */
export function SelectRow({ label, description, value, options, onChange, disabled = false }: SelectRowProps): React.JSX.Element {
  const selectId = useId();
  const descriptionId = useId();
  return (
    <div className="bn-settings-select">
      <div className="bn-settings-select__line">
        <label htmlFor={selectId} className="bn-settings-select__label">{label}</label>
        <span className="bn-settings-select__control">
          <select id={selectId} className="bn-settings-select__input" value={value} disabled={disabled}
            aria-describedby={description ? descriptionId : undefined} onChange={(event) => { onChange(event.target.value); }}>
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled} lang={option.lang}>{option.label}</option>
            ))}
          </select>
          <span className="bn-settings-select__chevron"><Icon name="down" size="s" /></span>
        </span>
      </div>
      {description && <p id={descriptionId} className="bn-settings-select__description">{description}</p>}
    </div>
  );
}
