import { useEffect, useState } from 'react';
import { useOnline } from '../offline/useQueueStatus';
import { fetchSummary, type AccountSummary } from './profileApi';

export type SummaryState =
  | { readonly status: 'idle' | 'loading' | 'unavailable' }
  | { readonly status: 'ready'; readonly summary: AccountSummary };

/** The account's totals in the cloud; unavailable offline or when the API cannot answer, never an error screen. */
export function useAccountSummary(token: string | null): SummaryState {
  const online = useOnline();
  const [found, setFound] = useState<{ readonly token: string; readonly state: SummaryState } | null>(null);
  useEffect(() => {
    if (!token || !online) return;
    let active = true;
    fetchSummary(token)
      .then((summary) => { if (active) setFound({ token, state: { status: 'ready', summary } }); })
      .catch(() => { if (active) setFound({ token, state: { status: 'unavailable' } }); });
    return () => { active = false; };
  }, [token, online]);
  if (!token) return { status: 'idle' };
  if (found?.token === token) return found.state;
  return online ? { status: 'loading' } : { status: 'unavailable' };
}
