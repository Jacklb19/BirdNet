import { createContext, useContext } from 'react';
import type { AccountState } from './useAccount';

export const AccountContext = createContext<AccountState | null>(null);

/** The single account session of the app (map, sites, top bar and the account screen share it). */
export function useAccountContext(): AccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccountContext must be used inside AccountProvider.');
  return value;
}
