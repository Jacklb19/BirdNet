import { useI18n } from '../../i18n';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';

/** Placeholder until the screen is implemented. */
export default function SettingsPage(): React.JSX.Element {
  const { dict } = useI18n();
  return <Page><PageHeader title={dict.settings.title} /></Page>;
}
