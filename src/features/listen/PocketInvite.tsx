import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { screenAwakeSupported } from '../../shared/useScreenAwake';
import { enterPocketMode } from './pocketMode';

/**
 * Offers pocket mode while a session is listening. Left out where the browser cannot keep the screen on: there the
 * phone would lock in the pocket and the session would end, which is the opposite of what the button promises.
 */
export function PocketInvite(): React.JSX.Element | null {
  const { dict } = useI18n();
  const t = dict.listen.pocket;
  if (!screenAwakeSupported) return null;
  return (
    <Notice icon="listen" title={t.title} action={<Button variant="secondary" onClick={enterPocketMode}>{t.enter}</Button>}>
      {t.invite}
    </Notice>
  );
}
