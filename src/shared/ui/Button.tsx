import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  readonly icon?: IconName;
  readonly block?: boolean;
}

/** One primary action per screen; secondary and quiet variants never compete with it. */
export function Button({ variant = 'primary', icon, block = false, className, children, type = 'button', ...rest }: ButtonProps): React.JSX.Element {
  const classes = ['bn-button', `bn-button--${variant}`, block ? 'bn-button--block' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} size="s" />}
      <span>{children}</span>
    </button>
  );
}
