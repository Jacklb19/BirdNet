import './Toggle.css';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Id of the visible text that names this switch. */
  readonly labelledBy: string;
  readonly disabled?: boolean;
}

export function Toggle({ checked, onChange, labelledBy, disabled = false }: ToggleProps): React.JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} disabled={disabled}
      className="bn-toggle" onClick={() => { onChange(!checked); }}>
      <span className="bn-toggle__knob" />
    </button>
  );
}
