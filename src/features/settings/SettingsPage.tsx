import { useEffect, useRef, useState } from 'react';
import { routeHash } from '../../app/routes';
import { LOCALES, isLocale, useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { THEME_PREFERENCES, useTheme } from '../../theme';
import { useModel } from '../offline/useModel';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { ChoiceGroup } from './ChoiceGroup';
import { ModelSettings } from './ModelSettings';
import { PermissionSettings } from './PermissionSettings';
import { SelectRow } from './SelectRow';
import { takeRequestedSection } from './settingsSections';
import { StorageSettings } from './StorageSettings';
import './SettingsPage.css';

/** Settings: what may leave the phone, appearance and language first; the model and local space under technical options; credits last. */
export default function SettingsPage(): React.JSX.Element {
  const { dict, locale, setLocale } = useI18n();
  const texts = dict.settings;
  const { preference, setTheme } = useTheme();
  const offline = useOfflineSettings();
  const model = useModel();
  // A model that is missing or failed is the one technical thing the person must see without looking for it.
  const needsAttention = model.state === 'missing' || model.state === 'error';
  // Null until the person opens or closes the group themselves; from then on their choice stands.
  const [advancedOpen, setAdvancedOpen] = useState<boolean | null>(null);
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

      <PermissionSettings ref={permissionsRef} offline={offline} />

      <ChoiceGroup title={texts.appearance.title} value={preference} onChange={setTheme}
        options={THEME_PREFERENCES.map((value) => ({ value, label: texts.appearance.options[value] }))} />

      <ListGroup title={texts.language.title}>
        <SelectRow label={texts.language.label} value={locale}
          options={LOCALES.map((entry) => ({ value: entry.code, label: entry.nativeName, lang: entry.code }))}
          onChange={(value) => { if (isLocale(value)) setLocale(value); }} />
      </ListGroup>

      {/* The model and the queue's space look after themselves (ADR-19); they stay one tap away for whoever needs them. */}
      <details className="bn-settings-advanced" open={advancedOpen ?? needsAttention}
        onToggle={(event) => { setAdvancedOpen(event.currentTarget.open); }}>
        <summary className="bn-settings-advanced__summary">
          <span className="bn-settings-advanced__title">{texts.advanced.title}</span>
          <span className="bn-settings-advanced__detail">{texts.advanced.detail}</span>
        </summary>
        <div className="bn-settings-advanced__body">
          <ModelSettings />
          <StorageSettings offline={offline} />
        </div>
      </details>

      <ListGroup title={texts.credits.title}>
        <ListRow label={texts.credits.model} description={texts.credits.modelDetail} />
        <ListRow label={texts.credits.names} description={texts.credits.namesDetail} />
        <ListRow label={texts.credits.photos} description={texts.credits.photosDetail} />
        <ListRow label={texts.credits.range} description={texts.credits.rangeDetail} />
      </ListGroup>

    </Page>
  );
}
