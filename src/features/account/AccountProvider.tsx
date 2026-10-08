import type { ReactNode } from 'react';
import { AccountContext } from './accountContext';
import { useAccount } from './useAccount';

/** Runs useAccount() once so the sync session is bound to Supabase Auth exactly one time. */
export function AccountProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const account = useAccount();
  return <AccountContext value={account}>{children}</AccountContext>;
}
