import { useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import './PrivacyNote.css';

/** Where the audio goes: it is analysed on the device, and only what the person turned on in Settings leaves it. */
export function PrivacyNote(): React.JSX.Element {
  const { dict } = useI18n();
  return (
    <p className="bn-listen-privacy">
      <Icon name="privacy" size="s" />
      <span>{dict.listen.privacy.local}</span>
    </p>
  );
}
