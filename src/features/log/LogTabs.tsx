import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import './LogTabs.css';

/** The log section has two views of the same records: day by day, or one sticker per species. */
export function LogTabs({ current }: { readonly current: 'log' | 'album' }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.species.album.tabs;
  return (
    <nav className="bn-log-tabs" aria-label={texts.label}>
      <a className="bn-log-tabs__link" href={routeHash({ name: 'log' })} aria-current={current === 'log' ? 'page' : undefined}>
        <Icon name="log" size="s" />{texts.log}
      </a>
      <a className="bn-log-tabs__link" href={routeHash({ name: 'album' })} aria-current={current === 'album' ? 'page' : undefined}>
        <Icon name="album" size="s" />{texts.album}
      </a>
    </nav>
  );
}
