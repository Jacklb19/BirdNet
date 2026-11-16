import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { accountInitials } from '../features/account/accountInitials';
import { Icon } from '../shared/ui/Icon';
import { usePopover } from '../shared/ui/usePopover';
import type { Route } from './routes';
import { accountLinks } from './siteMenu';
import '../shared/ui/Popover.css';
import './SessionEntry.css';

export interface SessionEntryProps {
  /** The screen being shown, so the menu marks the account or the settings when one of them is open. */
  readonly place?: Route['name'];
}

/**
 * The signed-in person's corner of the bar (ADR-47): their photo or initials, which open a short menu with the
 * account, the settings, the credits and signing out (offline, the initials of the account the phone keeps signed
 * in). A disclosure: the button says whether the menu is open, Escape closes it and gives the focus back.
 */
export function SessionEntry({ place = 'home' }: SessionEntryProps): React.JSX.Element | null {
  const { dict } = useI18n();
  const account = useAccountContext();
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => { setOpen(false); }, []);
  const style = usePopover(open, wrapper, menu, close, { width: 'end', widthToken: '--account-menu-width' });

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!account.identity) return null;
  const name = account.profile?.alias ?? account.identity.email ?? '';
  const initials = accountInitials(name);
  const avatar = account.profile?.avatarUrl;
  const current = place === 'account' || place === 'settings';
  return (
    <div ref={wrapper} className="bn-session">
      <button ref={button} type="button" className="bn-session__avatar" aria-expanded={open} aria-controls={menuId}
        aria-label={dict.app.accountMenu(name || dict.app.accountButton)} data-current={current || undefined}
        onClick={() => { setOpen((value) => !value); }}>
        {avatar
          ? <img className="bn-session__photo" src={avatar} alt="" crossOrigin="anonymous" />
          : initials ?? <Icon name="account" />}
      </button>
      {createPortal(
        <div ref={menu} id={menuId} className="bn-popover bn-session__menu" hidden={!open} style={style}
          onBlur={(event) => { if (!menu.current?.contains(event.relatedTarget) && !wrapper.current?.contains(event.relatedTarget)) setOpen(false); }}>
          {name && <p className="bn-session__who">{name}</p>}
          <ul className="bn-session__list">
            {accountLinks(dict, place).map((link) => (
              <li key={link.key}>
                <a className="bn-session__item" href={link.href} aria-current={link.current ? 'page' : undefined} onClick={close}>
                  {link.icon && <Icon name={link.icon} size="s" />}
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
            <li>
              <button type="button" className="bn-session__item bn-session__item--danger" aria-busy={account.working || undefined}
                onClick={() => { if (!account.working) { close(); void account.signOut(); } }}>
                <Icon name="signOut" size="s" />
                <span>{dict.app.signOut}</span>
              </button>
            </li>
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
