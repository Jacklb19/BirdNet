import { useEffect, useId, useRef } from 'react';
import { formatBytes, useI18n } from '../../i18n';
import { Icon, type IconName } from './Icon';
import './FilePicker.css';

export interface FilePickerProps {
  readonly label: string;
  readonly accept: string;
  readonly file: File | null;
  readonly onChange: (file: File | null) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly icon?: IconName;
}

/**
 * Choosing a file inside Trino's look (ADR-47): a button, then the chosen file's name and size with ways to change
 * or remove it. The system's own dialog still opens to pick it; only what Trino draws is themed. The native input
 * stays in the page, visually hidden, so required validation, the keyboard and screen readers keep working.
 */
export function FilePicker({ label, accept, file, onChange, required = false, disabled = false, hint, icon = 'plus' }: FilePickerProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.common.controls.file;
  const id = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  // A file cleared from outside (after an import) also leaves the native input empty, so choosing it again fires.
  useEffect(() => { if (!file && input.current) input.current.value = ''; }, [file]);

  return (
    <div className="bn-file-picker">
      <span className="bn-file-picker__label" id={`${id}-label`}>{label}</span>
      <input ref={input} id={id} className="visually-hidden bn-file-picker__input" type="file" accept={accept} required={required} disabled={disabled}
        aria-labelledby={`${id}-label`} aria-describedby={hint ? hintId : undefined}
        onChange={(event) => { onChange(event.target.files?.[0] ?? null); }} />
      {file ? (
        <div className="bn-file-picker__chosen">
          <Icon name="check" size="s" />
          <span className="bn-file-picker__name">
            <span>{file.name}</span>
            <span className="bn-file-picker__size">{formatBytes(file.size, locale)}</span>
          </span>
          <label htmlFor={id} className="bn-file-picker__action" aria-disabled={disabled || undefined}>{texts.change}</label>
          <button type="button" className="bn-file-picker__action" disabled={disabled} onClick={() => { onChange(null); input.current?.focus(); }}>
            {texts.remove}
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="bn-file-picker__button" aria-disabled={disabled || undefined}>
          <Icon name={icon} size="s" />
          <span>{texts.choose}</span>
        </label>
      )}
      {hint && <p id={hintId} className="bn-file-picker__hint">{hint}</p>}
    </div>
  );
}
