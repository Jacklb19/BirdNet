import { AccountProvider } from './features/account/AccountProvider';
import { ListeningProvider } from './features/listen/ListeningProvider';
import { WalkProvider } from './features/walk/WalkProvider';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import { AppShell } from './app/AppShell';

/** Providers in dependency order: interface preferences, the account session, the listening session, then its walk. */
export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AccountProvider>
          <ListeningProvider>
            <WalkProvider>
              <AppShell />
            </WalkProvider>
          </ListeningProvider>
        </AccountProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
