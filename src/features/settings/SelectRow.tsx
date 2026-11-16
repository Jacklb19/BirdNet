import { useId } from 'react';
import { Dropdown, type DropdownOption } from '../../shared/ui/Dropdown';
import './SelectRow.css';

export type SelectRowOption = DropdownOption;

export interface SelectRowProps {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly options: readonly SelectRowOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/** A settings row whose value is picked from Trino's own list (ADR-47), the same on every platform and theme. */
export function SelectRow({ label, description, value, options, onChange, disabled = false }: SelectRowProps): React.JSX.Element {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="bn-settings-select">
      <div className="bn-settings-select__line">
        <span id={labelId} className="bn-settings-select__label">{label}</span>
        <Dropdown variant="row" labelId={labelId} value={value} options={options} onChange={onChange} disabled={disabled}
          describedBy={description ? descriptionId : undefined} />
      </div>
      {description && <p id={descriptionId} className="bn-settings-select__description">{description}</p>}
    </div>
  );
}
