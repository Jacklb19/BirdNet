import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import './PrivacyNote.css';

/**
 * Where the audio goes. It is analysed on the device; doubtful fragments leave it only when the person
 * authorised it in Settings, and the note says which case applies.
 */
export function PrivacyNote(): React.JSX.Element {
  const { dict } = useI18n();
  const { settings } = useOfflineSettings();
  return (
    <p className="bn-listen-privacy">
      <Icon name="privacy" size="s" />
      <span>{settings?.audioConsent ? dict.listen.privacy.fragments : dict.listen.privacy.local}</span>
    </p>
  );
}
