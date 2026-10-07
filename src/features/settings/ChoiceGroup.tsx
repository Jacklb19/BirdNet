import { useId } from 'react';
import { Icon } from '../../shared/ui/Icon';
import './ChoiceGroup.css';

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ChoiceGroupProps<T extends string> {
  readonly title: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/**
 * Settings group whose rows are one exclusive choice, marked with a check as on the phone's own settings.
 * Native radios under a fieldset give arrow-key movement and the group name to assistive technology.
 */
export function ChoiceGroup<T extends string>({ title, options, value, onChange }: ChoiceGroupProps<T>): React.JSX.Element {
  const name = useId();
  return (
    <fieldset className="bn-settings-choice">
      <legend className="bn-settings-choice__title">{title}</legend>
      <div className="bn-settings-choice__body">
        {options.map((option) => (
          <label key={option.value} className="bn-settings-choice__option">
            <input type="radio" className="bn-settings-choice__input visually-hidden" name={name} value={option.value}
              checked={option.value === value} onChange={() => { onChange(option.value); }} />
            <span className="bn-settings-choice__label">{option.label}</span>
            <span className="bn-settings-choice__check"><Icon name="check" size="s" /></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
