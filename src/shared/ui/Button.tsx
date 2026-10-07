import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Button.css';

interface ButtonLook {
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  readonly icon?: IconName;
  readonly block?: boolean;
}

export interface ButtonProps extends ButtonLook, ButtonHTMLAttributes<HTMLButtonElement> {
  readonly href?: undefined;
}

/**
 * Navigation that looks like a button. It stays a link, so it can open in a new tab and is announced as a link
 * (it has no disabled state: a link that goes nowhere is left out instead).
 */
export interface ButtonLinkProps extends ButtonLook, AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
}

function classesOf({ variant = 'primary', block = false, className }: ButtonLook & { readonly className?: string }): string {
  return ['bn-button', `bn-button--${variant}`, block ? 'bn-button--block' : '', className ?? ''].filter(Boolean).join(' ');
}

function Content({ icon, children }: { readonly icon?: IconName; readonly children?: ReactNode }): React.JSX.Element {
  return (
    <>
      {icon && <Icon name={icon} size="s" />}
      <span>{children}</span>
    </>
  );
}

function LinkButton({ variant, icon, block, className, children, ...rest }: ButtonLinkProps): React.JSX.Element {
  return <a className={classesOf({ variant, block, className })} {...rest}><Content icon={icon}>{children}</Content></a>;
}

function PlainButton({ variant, icon, block, className, children, type = 'button', ...rest }: ButtonProps): React.JSX.Element {
  return (
    <button type={type} className={classesOf({ variant, block, className })} {...rest}>
      <Content icon={icon}>{children}</Content>
    </button>
  );
}

/** One primary action per screen; secondary and quiet variants never compete with it. With `href` it is a link. */
export function Button(props: ButtonProps | ButtonLinkProps): React.JSX.Element {
  return props.href === undefined ? <PlainButton {...props} /> : <LinkButton {...props} />;
}
