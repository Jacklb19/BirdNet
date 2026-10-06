import { useI18n, type Locale } from '../../i18n';
import { useTheme, type ThemePreference } from '../../theme';
import { FieldIcon, type FieldIconName } from '../../shared/FieldIcon';
import { DiagnosticoPage } from '../diagnostico/DiagnosticoPage';
import { OfflinePanel } from '../offline/OfflinePanel';

/** Native preference controls preserve keyboard navigation and immediate local persistence. */
export function SettingsPage(): React.JSX.Element {
  const { locale, setLocale, dict } = useI18n();
  const { preference, setTheme } = useTheme();
  const s = dict.settings;
  return (
    <section aria-label={s.title} className="page settings-page">
      <header className="page-heading"><p className="eyebrow">{dict.app.navSettings}</p><h2>{s.title}</h2><p>{s.subtitle}</p></header>
      <div className="settings-groups">
        <fieldset className="preference-group">
          <legend>{s.themeLabel}</legend>
          {([
            ['system', s.themeSystem, 'system'], ['light', s.themeLight, 'sun'], ['dark', s.themeDark, 'moon'],
          ] as [ThemePreference, string, FieldIconName][]).map(([value, label, icon]) => (
            <label key={value} className="preference-option" data-selected={preference === value}>
              <span className="theme-swatch" data-preview={value} aria-hidden="true"><FieldIcon name={icon} /></span><span>{label}</span>
              <input type="radio" name="theme" value={value} checked={preference === value} onChange={() => { setTheme(value); }} />
            </label>
          ))}
        </fieldset>
        <fieldset className="preference-group">
          <legend>{s.languageLabel}</legend>
          {([['es', s.langEs], ['en', s.langEn]] as [Locale, string][]).map(([value, label]) => (
            <label key={value} className="preference-option" data-selected={locale === value}>
              <span className="language-code" aria-hidden="true">{value.toUpperCase()}</span><span>{label}</span>
              <input type="radio" name="language" value={value} checked={locale === value} onChange={() => { setLocale(value); }} />
            </label>
          ))}
        </fieldset>
      </div>
      <p className="saved-notice"><FieldIcon name="shield" />{s.savedNotice}</p>
      <OfflinePanel />
      {import.meta.env.DEV && <details className="development-tools">
        <summary>{dict.field.developmentTools}</summary>
        <DiagnosticoPage />
      </details>}
    </section>
  );
}
