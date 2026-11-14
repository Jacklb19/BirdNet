import { AccountProvider } from './features/account/AccountProvider';
import { useAccountContext } from './features/account/accountContext';
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
          <AccountSession />
        </AccountProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

/** A change of identity releases the previous account's microphone, GPS watch and session state. */
function AccountSession(): React.JSX.Element {
  const userId = useAccountContext().identity?.userId ?? null;
  return (
    <ListeningProvider key={userId ?? 'signed-out'} ownerId={userId}>
      <WalkProvider><AppShell /></WalkProvider>
    </ListeningProvider>
  );
}

export default App;
