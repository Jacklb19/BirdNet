import { useI18n } from '../i18n';
import { Icon } from '../shared/ui/Icon';
import { NAV_ITEMS, type Section } from './navigation';
import './TabBar.css';

/** Bottom navigation on phones; hidden by CSS on wide screens, where the floating top bar takes over. */
export function TabBar({ current }: { readonly current: Section }): React.JSX.Element {
  const { dict } = useI18n();
  return (
    <nav className="bn-tabbar" aria-label={dict.app.navLabel}>
      <ul className="bn-tabbar__list">
        {NAV_ITEMS.map((entry) => (
          <li key={entry.section}>
            <a className="bn-tabbar__link" href={entry.href} aria-current={entry.section === current ? 'page' : undefined}>
              <Icon name={entry.icon} />
              <span>{dict.app.nav[entry.section]}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
