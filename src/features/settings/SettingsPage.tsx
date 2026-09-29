/**
 * Settings page — theme and language preferences (docs/pantallas.md §3).
 *
 * Persisted in localStorage under 'birdnet_settings' with try/catch protection.
 * Future extension (S5): sync to profiles.preferences when authenticated.
 */

import { useI18n, type Locale } from '../../i18n';
import { useTheme, type ThemePreference } from '../../theme';

export function SettingsPage(): React.JSX.Element {
  const { locale, setLocale, dict } = useI18n();
  const { preference, setTheme } = useTheme();

  const s = dict.settings;

  return (
    <section
      aria-label={s.title}
      style={{ padding: 'var(--spacing-4)', maxWidth: '600px' }}
    >
      <h2
        style={{
          fontSize: 'var(--font-size-xl)',
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {s.title}
      </h2>
      <p
        style={{
          fontSize: 'var(--font-size-base)',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        {s.subtitle}
      </p>

      {/* ─── Theme selector ─────────────────────────────────────────── */}
      <fieldset
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <legend
          style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
            padding: '0 var(--spacing-2)',
          }}
        >
          {s.themeLabel}
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-3)' }}>
          {([
            ['system', s.themeSystem],
            ['light', s.themeLight],
            ['dark', s.themeDark],
          ] as [ThemePreference, string][]).map(([value, label]) => (
            <label
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-3)',
                cursor: 'pointer',
                padding: 'var(--spacing-2) var(--spacing-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: preference === value ? 'var(--color-surface-raised)' : 'transparent',
                minHeight: 'var(--touch-target-min)',
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text-secondary)',
                transition: 'var(--transition-colors)',
              }}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={preference === value}
                onChange={() => { setTheme(value); }}
                style={{ accentColor: 'var(--color-primary)', width: '18px', height: '18px' }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ─── Language selector ──────────────────────────────────────── */}
      <fieldset
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <legend
          style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
            padding: '0 var(--spacing-2)',
          }}
        >
          {s.languageLabel}
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-3)' }}>
          {([
            ['es', s.langEs],
            ['en', s.langEn],
          ] as [Locale, string][]).map(([value, label]) => (
            <label
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-3)',
                cursor: 'pointer',
                padding: 'var(--spacing-2) var(--spacing-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: locale === value ? 'var(--color-surface-raised)' : 'transparent',
                minHeight: 'var(--touch-target-min)',
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text-secondary)',
                transition: 'var(--transition-colors)',
              }}
            >
              <input
                type="radio"
                name="language"
                value={value}
                checked={locale === value}
                onChange={() => { setLocale(value); }}
                style={{ accentColor: 'var(--color-primary)', width: '18px', height: '18px' }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ─── Persistence notice ─────────────────────────────────────── */}
      <p
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-subtle)',
          fontStyle: 'italic',
        }}
      >
        {s.savedNotice}
      </p>
    </section>
  );
}
