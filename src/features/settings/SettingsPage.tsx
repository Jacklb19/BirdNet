import { useEffect, useRef } from 'react';
import { routeHash } from '../../app/routes';
import { LOCALES, isLocale, useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { THEME_PREFERENCES, useTheme } from '../../theme';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { ChoiceGroup } from './ChoiceGroup';
import { ModelSettings } from './ModelSettings';
import { PermissionSettings } from './PermissionSettings';
import { SelectRow } from './SelectRow';
import { takeRequestedSection } from './settingsSections';
import { StorageSettings } from './StorageSettings';

/** Settings: the model, what may leave the phone, local space, appearance, language and credits. */
export default function SettingsPage(): React.JSX.Element {
  const { dict, locale, setLocale } = useI18n();
  const texts = dict.settings;
  const { preference, setTheme } = useTheme();
  const offline = useOfflineSettings();
  const permissionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (takeRequestedSection() !== 'permissions') return;
    const group = permissionsRef.current;
    group?.scrollIntoView({ block: 'start' });
    group?.focus({ preventScroll: true });
  }, []);

  return (
    <Page width="narrow">
      <PageHeader title={texts.title} back={{ href: routeHash({ name: 'account' }), label: texts.back }} />

      {offline.error && <Notice tone="error">{texts.saveError}</Notice>}

      <ModelSettings />
      <PermissionSettings ref={permissionsRef} offline={offline} />
      <StorageSettings offline={offline} />

      <ChoiceGroup title={texts.appearance.title} value={preference} onChange={setTheme}
        options={THEME_PREFERENCES.map((value) => ({ value, label: texts.appearance.options[value] }))} />

      <ListGroup title={texts.language.title}>
        <SelectRow label={texts.language.label} value={locale}
          options={LOCALES.map((entry) => ({ value: entry.code, label: entry.nativeName, lang: entry.code }))}
          onChange={(value) => { if (isLocale(value)) setLocale(value); }} />
      </ListGroup>

      <ListGroup title={texts.credits.title}>
        <ListRow label={texts.credits.model} description={texts.credits.modelDetail} />
        <ListRow label={texts.credits.names} description={texts.credits.namesDetail} />
        <ListRow label={texts.credits.photos} description={texts.credits.photosDetail} />
      </ListGroup>

      <ListGroup>
        <ListRow icon="bird" label={texts.intro} href={routeHash({ name: 'home' })} />
      </ListGroup>
    </Page>
  );
}
