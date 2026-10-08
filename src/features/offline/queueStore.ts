import type { ClassifiedDetection } from '../inference/detectionPolicy';
import { CONFIDENCE_THRESHOLDS, FIELD_LIMITS, isUuid } from '../../config/contract';
import { announceQueueChange } from './queueChanges';
import { approximateLocation, assertQueueCapacity, encodeAudio } from './queuePolicy';
import {
  AUDIO_REVIEW_STATUS, DATABASE_NAME, DATABASE_VERSION, DEFAULT_QUEUE_BYTES, isEditableSettingsKey, QUEUED_STATUS_BY_LOCAL_STATUS,
  SETTINGS_RECORD_KEY, STORES, type EditableSettings, type StoreName,
} from './offline.constants';
import type { CachedSite, HistoryEntry, OfflineSettings, PersistenceContext, QueueStats, StoredAudio, StoredDetection, SyncSession } from './types';

/** In-line key of every keyed store; settings use the out-of-line `SETTINGS_RECORD_KEY` instead. */
const RECORD_KEY_PATH = 'id' satisfies keyof StoredDetection & keyof StoredAudio & keyof HistoryEntry;
const STORE_OPTIONS: Readonly<Record<StoreName, IDBObjectStoreParameters | undefined>> = {
  [STORES.detections]: { keyPath: RECORD_KEY_PATH },
  [STORES.audio]: { keyPath: RECORD_KEY_PATH },
  [STORES.settings]: undefined,
  [STORES.history]: { keyPath: RECORD_KEY_PATH },
};
/** Upper bound of a model probability; anything above it is a corrupted value. */
const MAX_CONFIDENCE = 1;

const defaultSettings = (): OfflineSettings => ({ maxBytes: DEFAULT_QUEUE_BYTES, audioConsent: false, locationEnabled: false, session: null });
function measureRecord(record: StoredDetection): void {
  let previous: number;
  do { previous = record.bytes; record.bytes = new TextEncoder().encode(JSON.stringify(record)).byteLength; } while (record.bytes !== previous);
}
function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { operation.onsuccess = () => { resolve(operation.result); }; operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); }; });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => { resolve(); }; transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); }; });
}
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  operation.onupgradeneeded = () => {
    const db = operation.result;
    for (const name of Object.values(STORES)) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, STORE_OPTIONS[name]);
    }
  };
  return request(operation);
}

/** All writers share read/write transactions, including workers and service workers. */
async function transact<T>(stores: StoreName[], mode: IDBTransactionMode, action: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await open();
  const transaction = db.transaction(stores, mode);
  const done = completed(transaction);
  try { const result = await action(transaction); await done; return result; }
  catch (error) { try { transaction.abort(); } catch { /* A failed transaction may already have aborted. */ } await done.catch(() => undefined); throw error; }
  finally { db.close(); }
}
async function readSettings(transaction: IDBTransaction): Promise<OfflineSettings> {
  return (await request(transaction.objectStore(STORES.settings).get(SETTINGS_RECORD_KEY)) as OfflineSettings | undefined) ?? defaultSettings();
}
async function writeSettings(transaction: IDBTransaction, settings: OfflineSettings): Promise<void> {
  await request(transaction.objectStore(STORES.settings).put(settings, SETTINGS_RECORD_KEY));
}
export async function getSettings(): Promise<OfflineSettings> {
  return transact([STORES.settings], 'readonly', readSettings);
}
export async function updateSettings(changes: EditableSettings): Promise<void> {
  if (!Object.keys(changes).every(isEditableSettingsKey)) throw new Error('Invalid preferences.');
  if ('activeSiteId' in changes && changes.activeSiteId !== null && !isUuid(changes.activeSiteId)) throw new Error('Invalid site.');
  await transact([STORES.settings, STORES.detections, STORES.audio], 'readwrite', async (tx) => {
    const next = { ...await readSettings(tx), ...changes };
    const records = await request(tx.objectStore(STORES.detections).getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore(STORES.audio).getAll()) as StoredAudio[];
    assertQueueCapacity(records.reduce((total, row) => total + row.bytes, 0) + audio.reduce((total, row) => total + row.bytes, 0), 0, next.maxBytes);
    if (typeof next.audioConsent !== 'boolean' || typeof next.locationEnabled !== 'boolean') throw new Error('Invalid preferences.');
    await writeSettings(tx, next);
  });
  announceQueueChange(['settings']);
}

/** S5 must call this only after an explicit account association; never silently reassign owners. */
export async function bindSyncSession(session: SyncSession | null, claimUnowned = false): Promise<void> {
  if (session && (!isUuid(session.userId) || !session.accessToken || !Number.isFinite(session.expiresAt))) throw new Error('Invalid session.');
  await transact([STORES.settings, STORES.detections, STORES.audio], 'readwrite', async (tx) => {
    const settings = await readSettings(tx);
    if (session && claimUnowned) {
      const records = await request(tx.objectStore(STORES.detections).getAll()) as StoredDetection[];
      const audio = await request(tx.objectStore(STORES.audio).getAll()) as StoredAudio[];
      const next = records.map((row) => {
        if (row.owner) return row;
        const updated = { ...row, owner: session.userId };
        measureRecord(updated);
        return updated;
      });
      assertQueueCapacity(next.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), 0, settings.maxBytes);
      for (const row of next) await request(tx.objectStore(STORES.detections).put(row));
    }
    await writeSettings(tx, { ...settings, session });
  });
  // Claiming gives records an owner, which changes what the log and the account show as uploadable.
  announceQueueChange(session && claimUnowned ? ['settings', 'records'] : ['settings']);
}
/**
 * Replaces the offline copy of `ownerId`'s sites; the active site is cleared if it no longer exists. The owner is
 * stored with the list, so it is shown only to that account (see `keepSitesOf`).
 */
export async function setCachedSites(sites: readonly CachedSite[], ownerId: string): Promise<void> {
  if (!isUuid(ownerId) || sites.some((site) => !isUuid(site.id) || !site.name || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude))) throw new Error('Invalid sites.');
  await transact([STORES.settings], 'readwrite', async (tx) => {
    const settings = await readSettings(tx);
    const activeSiteId = sites.some((site) => site.id === settings.activeSiteId) ? settings.activeSiteId : null;
    await writeSettings(tx, { ...settings, sites: [...sites], sitesOwner: ownerId, activeSiteId });
  });
  announceQueueChange(['settings']);
}
/**
 * Cached sites belong to the account that fetched them. Unless they belong to `userId`, they are forgotten
 * together with the active site; null (signed out) always forgets them, so the next person on a shared phone
 * never sees them. Lists cached before the owner was stored have none and are forgotten too.
 */
export async function keepSitesOf(userId: string | null): Promise<void> {
  if (userId !== null && !isUuid(userId)) throw new Error('Invalid account.');
  const forgotten = await transact([STORES.settings], 'readwrite', async (tx) => {
    const settings = await readSettings(tx);
    const nothingCached = !settings.sites?.length && !settings.activeSiteId && !settings.sitesOwner;
    if (nothingCached || (userId !== null && settings.sitesOwner === userId)) return false;
    await writeSettings(tx, { ...settings, sites: [], sitesOwner: null, activeSiteId: null });
    return true;
  });
  if (forgotten) announceQueueChange(['settings']);
}
export async function listHistory(): Promise<HistoryEntry[]> {
  const rows = await transact([STORES.history], 'readonly', async (tx) => request(tx.objectStore(STORES.history).getAll()) as Promise<HistoryEntry[]>);
  return rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}
export async function listDetections(): Promise<StoredDetection[]> {
  return transact([STORES.detections], 'readonly', async (tx) => request(tx.objectStore(STORES.detections).getAll()) as Promise<StoredDetection[]>);
}
export async function getAudio(id: string): Promise<StoredAudio | undefined> {
  return transact([STORES.audio], 'readonly', async (tx) => request(tx.objectStore(STORES.audio).get(id)) as Promise<StoredAudio | undefined>);
}
export async function queueStats(): Promise<QueueStats> {
  return transact([STORES.detections, STORES.audio], 'readonly', async (tx) => {
    const records = await request(tx.objectStore(STORES.detections).getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore(STORES.audio).getAll()) as StoredAudio[];
    return { count: records.length, bytes: records.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), waitingLocation: records.filter((row) => !row.location).length, waitingAccount: records.filter((row) => !row.owner).length };
  });
}

/** The API rejects what the queue would otherwise keep forever, so the same limits apply before storing. */
function isStorable(candidate: ClassifiedDetection): boolean {
  return Boolean(candidate.scientificName) && candidate.scientificName.length <= FIELD_LIMITS.speciesName &&
    Object.hasOwn(QUEUED_STATUS_BY_LOCAL_STATUS, candidate.status) && Number.isFinite(candidate.confidence) && candidate.confidence >= CONFIDENCE_THRESHOLDS.discardBelow && candidate.confidence <= MAX_CONFIDENCE;
}

/** Called by the inference worker before it publishes a successful classification. */
export async function persistDetections(candidates: readonly ClassifiedDetection[], samples: Float32Array, context: PersistenceContext): Promise<void> {
  if (candidates.length === 0) return;
  const location = context.location ? approximateLocation(context.location.latitude, context.location.longitude) : null;
  const recordedAt = new Date(context.recordedAt).toISOString();
  if (!context.modelVersion || context.modelVersion.length > FIELD_LIMITS.modelVersion || !candidates.every(isStorable)) throw new Error('Invalid detection context.');
  const audioBlob = candidates.some((candidate) => candidate.status === AUDIO_REVIEW_STATUS) ? encodeAudio(samples) : null;
  await transact([STORES.settings, STORES.detections, STORES.audio], 'readwrite', async (tx) => {
    const settings = await readSettings(tx);
    const existing = await request(tx.objectStore(STORES.detections).getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore(STORES.audio).getAll()) as StoredAudio[];
    const audioId = audioBlob && settings.audioConsent ? crypto.randomUUID() : null;
    const records = candidates.map((candidate): StoredDetection => {
      const record: StoredDetection = { id: crypto.randomUUID(), species: candidate.scientificName, confidence: candidate.confidence, status: QUEUED_STATUS_BY_LOCAL_STATUS[candidate.status], recorded_at: recordedAt, location, model_version: context.modelVersion, owner: settings.session?.userId ?? null, audioId: candidate.status === AUDIO_REVIEW_STATUS ? audioId : null, metadataSynced: false, bytes: 0, siteId: settings.activeSiteId ?? null };
      measureRecord(record);
      return record;
    });
    assertQueueCapacity(existing.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), records.reduce((sum, row) => sum + row.bytes, 0) + (audioId ? audioBlob?.size ?? 0 : 0), settings.maxBytes);
    for (const record of records) await request(tx.objectStore(STORES.detections).add(record));
    if (audioId && audioBlob) await request(tx.objectStore(STORES.audio).add({ id: audioId, blob: audioBlob, bytes: audioBlob.size } satisfies StoredAudio));
  });
  announceQueueChange(['records']);
}

/** Metadata acknowledgement is separate from audio delivery; unacknowledged rows stay intact. */
export async function acknowledge(ids: readonly string[], audioDelivered = false): Promise<void> {
  await transact([STORES.detections, STORES.audio, STORES.history], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.detections);
    const history = tx.objectStore(STORES.history);
    const syncedAt = new Date().toISOString();
    for (const id of ids) {
      const row = await request(store.get(id)) as StoredDetection | undefined;
      if (!row) continue;
      if (row.audioId && !audioDelivered) await request(store.put({ ...row, metadataSynced: true }));
      else {
        await request(history.put({ id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at, siteId: row.siteId ?? null, syncedAt } satisfies HistoryEntry));
        await request(store.delete(id));
      }
    }
    const remaining = await request(store.getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore(STORES.audio).getAll()) as StoredAudio[];
    for (const row of audio) if (!remaining.some((record) => record.audioId === row.id)) await request(tx.objectStore(STORES.audio).delete(row.id));
  });
  // Also when only `metadataSynced` changed: counts and bytes stay the same, but the record is no longer pending.
  announceQueueChange(['records']);
}
