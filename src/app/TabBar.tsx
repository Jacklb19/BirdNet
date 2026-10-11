import { useI18n } from '../i18n';
import { Icon } from '../shared/ui/Icon';
import { useAccountContext } from '../features/account/accountContext';
import { tabItems, type Section } from './navigation';
import './TabBar.css';

/** Bottom navigation on phones; hidden by CSS on wide screens, where the bar's links take over. */
export function TabBar({ current }: { readonly current: Section }): React.JSX.Element {
  const { dict } = useI18n();
  const { session } = useAccountContext();
  return (
    <nav className="bn-tabbar" aria-label={dict.app.navLabel}>
      <ul className="bn-tabbar__list">
        {tabItems(session !== null).map((entry) => (
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
