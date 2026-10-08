import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import type { ListeningContextValue } from './listeningContext';

export type SessionError = NonNullable<ListeningContextValue['sessionError']>;

/** Errors whose fix lives in Settings (the downloaded model, the storage capacity). */
const FIXED_IN_SETTINGS: ReadonlySet<SessionError> = new Set(['model', 'storage']);

/** Why the session ended and how to fix it; the record button below starts a new one. */
export function SessionErrorNotice({ error }: { readonly error: SessionError }): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.listen.errors[error];
  const action = FIXED_IN_SETTINGS.has(error)
    ? <Button variant="quiet" href={routeHash({ name: 'settings' })}>{dict.listen.openSettings}</Button>
    : undefined;
  return <Notice tone="error" title={t.title} action={action}><p>{t.text}</p></Notice>;
}
