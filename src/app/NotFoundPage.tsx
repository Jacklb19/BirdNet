import { useI18n } from '../i18n';
import { Button } from '../shared/ui/Button';
import { EmptyState } from '../shared/ui/EmptyState';
import { Page } from '../shared/ui/Page';
import { PageHeader } from '../shared/ui/PageHeader';
import { routeHash } from './routes';

/** An address that leads to no screen: said plainly, with the two places a person most likely wanted. */
export default function NotFoundPage(): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.app.notFound;
  return (
    <Page width="narrow">
      <PageHeader title={dict.app.screens.notFound} />
      <EmptyState icon="search" title={t.title}
        action={(
          <>
            <Button href={routeHash({ name: 'listen' })} icon="listen">{t.listen}</Button>
            <Button variant="secondary" href={routeHash({ name: 'home' })} icon="home">{t.home}</Button>
          </>
        )}>
        {t.text}
      </EmptyState>
    </Page>
  );
}
