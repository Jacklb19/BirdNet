import './Toggle.css';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Id of the visible text that names this switch. */
  readonly labelledBy: string;
  /** Id of the visible text that explains what the switch allows, read after its name and state. */
  readonly describedBy?: string;
  readonly disabled?: boolean;
}

export function Toggle({ checked, onChange, labelledBy, describedBy, disabled = false }: ToggleProps): React.JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy} disabled={disabled}
      className="bn-toggle" onClick={() => { onChange(!checked); }}>
      <span className="bn-toggle__knob" />
    </button>
  );
}
