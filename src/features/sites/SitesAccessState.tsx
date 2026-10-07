import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';

export type SitesAccessReason = 'unconfigured' | 'signedOut';

/** Why sites cannot be shown yet, with the next step: sites belong to an account. */
export function SitesAccessState({ reason }: { readonly reason: SitesAccessReason }): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.sites;
  if (reason === 'unconfigured') {
    return (
      <EmptyState icon="sites" title={t.unconfiguredTitle}
        action={<Button href={routeHash({ name: 'listen' })}>{t.goToListen}</Button>}>
        <p>{t.unconfiguredText}</p>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="account" title={t.signedOutTitle}
      action={<Button href={routeHash({ name: 'account' })}>{t.goToAccount}</Button>}>
      <p>{t.signedOutText}</p>
    </EmptyState>
  );
}
