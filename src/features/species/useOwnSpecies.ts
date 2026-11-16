import { useAccountResource, type AccountResource } from '../../shared/useAccountResource';
import { useAccountContext } from '../account/accountContext';
import { fetchOwnSpecies, type OwnSpecies } from '../account/profileApi';
import { useOnline } from '../offline/useQueueStatus';

const NONE: readonly OwnSpecies[] = Object.freeze([]);
async function load(token: string, signal: AbortSignal): Promise<{ data: readonly OwnSpecies[]; limited: boolean }> {
  return { data: await fetchOwnSpecies(token, signal), limited: false };
}

/** The account's species across devices, with a distinct loading, offline or failed read. */
export function useOwnSpecies(): AccountResource<readonly OwnSpecies[]> {
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  return useAccountResource(token, session?.user.id ?? null, online, NONE, load);
}
