import { getSettings } from '../offline/queueStore';
import { entityKey, readJournal, saveEntity, setRelation } from './journalStore';
import type { StoredDetection } from '../offline/types';

let active: { owner: string; id: string } | null = null;
let selected: { owner: string; id: string } | null = null;
export const activeOutingId = (owner: string | null | undefined): string | null => active && active.owner === owner ? active.id : null;
export function chooseOuting(owner: string, id: string): void { selected = { owner, id }; }
export async function beginOuting(owner: string, walking: boolean): Promise<string> {
  const settings = await getSettings();
  if (settings.session?.userId !== owner) throw new Error('Account changed.');
  const previous = selected?.owner === owner ? (await readJournal(owner)).entities.find((row) => row.key === entityKey(owner, 'outing', selected?.id ?? '') && row.kind === 'outing' && !row.deleted) : null;
  selected = null;
  const data = previous?.kind === 'outing' && previous.data.kind === (walking ? 'walk' : 'stationary')
    ? { ...previous.data, ended_at: null }
    : { title: null, kind: walking ? 'walk' as const : 'stationary' as const, started_at: new Date().toISOString(), ended_at: null, note: null,
      site_id: settings.sitesOwner === owner ? settings.activeSiteId ?? null : null, walk_id: null };
  const id = await saveEntity(owner, 'outing', data, previous?.kind === 'outing' && previous.data.kind === data.kind ? previous.id : undefined);
  active = { owner, id };
  return id;
}
export async function endOuting(owner: string): Promise<void> {
  const id = activeOutingId(owner);
  if (active?.owner === owner) active = null;
  if (!id) return;
  const row = (await readJournal(owner)).entities.find((entry) => entry.id === id && entry.kind === 'outing');
  if (row?.kind === 'outing' && !row.deleted) await saveEntity(owner, 'outing', { ...row.data, ended_at: new Date().toISOString() }, id);
}
/** References are captured at classification, never reconstructed from overlapping time ranges. */
export async function storeOutingDetections(records: readonly StoredDetection[], outingId: string | null | undefined): Promise<void> {
  if (!outingId) return;
  for (const row of records) if (row.owner) await setRelation(row.owner, 'outingDetection', outingId, row.id, true);
}
