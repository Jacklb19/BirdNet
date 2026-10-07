import { AccountProvider } from './features/account/AccountProvider';
import { ListeningProvider } from './features/listen/ListeningProvider';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import { AppShell } from './app/AppShell';

/** Providers in dependency order: interface preferences, the account session, then the listening session. */
export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AccountProvider>
          <ListeningProvider>
            <AppShell />
          </ListeningProvider>
        </AccountProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
