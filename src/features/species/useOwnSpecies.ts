import { useEffect, useState } from 'react';
import { useAccountContext } from '../account/accountContext';
import { fetchOwnSpecies, type OwnSpecies } from '../account/profileApi';
import { useOnline } from '../offline/useQueueStatus';

/** The account's species in the cloud (every device); null signed out, offline, while loading or on failure. */
export function useOwnSpecies(): readonly OwnSpecies[] | null {
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const [found, setFound] = useState<{ readonly token: string; readonly species: readonly OwnSpecies[] } | null>(null);
  useEffect(() => {
    if (!token || !online) return;
    let active = true;
    fetchOwnSpecies(token).then((species) => { if (active) setFound({ token, species }); }).catch(() => undefined);
    return () => { active = false; };
  }, [token, online]);
  return found && found.token === token ? found.species : null;
}
