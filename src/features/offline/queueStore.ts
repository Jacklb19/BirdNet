import type { ClassifiedDetection } from '../inference/detectionPolicy';
import { assertQueueCapacity, encodeAudio } from './queuePolicy';
import { DATABASE_NAME, DEFAULT_QUEUE_BYTES, type OfflineSettings, type PersistenceContext, type QueueStats, type StoredAudio, type StoredDetection, type SyncSession } from './types';

const defaultSettings = (): OfflineSettings => ({ maxBytes: DEFAULT_QUEUE_BYTES, audioConsent: false, locationEnabled: false, session: null });
function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { operation.onsuccess = () => { resolve(operation.result); }; operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); }; });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => { resolve(); }; transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); }; });
}
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(DATABASE_NAME, 1);
  operation.onupgradeneeded = () => {
    const db = operation.result;
    db.createObjectStore('detections', { keyPath: 'id' });
    db.createObjectStore('audio', { keyPath: 'id' });
    db.createObjectStore('settings');
  };
  return request(operation);
}

/** All writers share read/write transactions, including workers and service workers. */
async function transact<T>(stores: string[], mode: IDBTransactionMode, action: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await open();
  const transaction = db.transaction(stores, mode);
  const done = completed(transaction);
  try { const result = await action(transaction); await done; return result; }
  catch (error) { try { transaction.abort(); } catch { /* A failed transaction may already have aborted. */ } await done.catch(() => undefined); throw error; }
  finally { db.close(); }
}
export async function getSettings(): Promise<OfflineSettings> {
  return transact(['settings'], 'readonly', async (tx) => (await request(tx.objectStore('settings').get('preferences')) as OfflineSettings | undefined) ?? defaultSettings());
}
export async function updateSettings(changes: Partial<Omit<OfflineSettings, 'session'>>): Promise<void> {
  if (Object.keys(changes).some((key) => !['maxBytes', 'audioConsent', 'locationEnabled'].includes(key))) throw new Error('Invalid preferences.');
  await transact(['settings', 'detections', 'audio'], 'readwrite', async (tx) => {
    const settingsStore = tx.objectStore('settings');
    const settings = (await request(settingsStore.get('preferences')) as OfflineSettings | undefined) ?? defaultSettings();
    const next = { ...settings, ...changes };
    const records = await request(tx.objectStore('detections').getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore('audio').getAll()) as StoredAudio[];
    assertQueueCapacity(records.reduce((total, row) => total + row.bytes, 0) + audio.reduce((total, row) => total + row.bytes, 0), 0, next.maxBytes);
    if (typeof next.audioConsent !== 'boolean' || typeof next.locationEnabled !== 'boolean') throw new Error('Invalid preferences.');
    await request(settingsStore.put(next, 'preferences'));
  });
}

/** S5 must call this only after an explicit account association; never silently reassign owners. */
export async function bindSyncSession(session: SyncSession | null, claimUnowned = false): Promise<void> {
  if (session && (!/^[a-f0-9-]{36}$/i.test(session.userId) || !session.accessToken || !Number.isFinite(session.expiresAt))) throw new Error('Invalid session.');
  await transact(['settings', 'detections', 'audio'], 'readwrite', async (tx) => {
    const store = tx.objectStore('settings');
    const settings = (await request(store.get('preferences')) as OfflineSettings | undefined) ?? defaultSettings();
    if (session && claimUnowned) {
      const records = await request(tx.objectStore('detections').getAll()) as StoredDetection[];
      const audio = await request(tx.objectStore('audio').getAll()) as StoredAudio[];
      const next = records.map((row) => {
        if (row.owner) return row;
        const updated = { ...row, owner: session.userId };
        updated.bytes = new TextEncoder().encode(JSON.stringify(updated)).byteLength;
        return updated;
      });
      assertQueueCapacity(next.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), 0, settings.maxBytes);
      for (const row of next) await request(tx.objectStore('detections').put(row));
    }
    await request(store.put({ ...settings, session }, 'preferences'));
  });
}
export async function listDetections(): Promise<StoredDetection[]> {
  return transact(['detections'], 'readonly', async (tx) => request(tx.objectStore('detections').getAll()) as Promise<StoredDetection[]>);
}
export async function getAudio(id: string): Promise<StoredAudio | undefined> {
  return transact(['audio'], 'readonly', async (tx) => request(tx.objectStore('audio').get(id)) as Promise<StoredAudio | undefined>);
}
export async function queueStats(): Promise<QueueStats> {
  return transact(['detections', 'audio'], 'readonly', async (tx) => {
    const records = await request(tx.objectStore('detections').getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore('audio').getAll()) as StoredAudio[];
    return { count: records.length, bytes: records.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), waitingLocation: records.filter((row) => !row.location).length, waitingAccount: records.filter((row) => !row.owner).length };
  });
}

/** Called by the inference worker before it publishes a successful classification. */
export async function persistDetections(candidates: readonly ClassifiedDetection[], samples: Float32Array, context: PersistenceContext): Promise<void> {
  if (candidates.length === 0) return;
  const audioBlob = candidates.some((candidate) => candidate.status === 'provisional') ? encodeAudio(samples) : null;
  await transact(['settings', 'detections', 'audio'], 'readwrite', async (tx) => {
    const settings = (await request(tx.objectStore('settings').get('preferences')) as OfflineSettings | undefined) ?? defaultSettings();
    const existing = await request(tx.objectStore('detections').getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore('audio').getAll()) as StoredAudio[];
    const audioId = audioBlob && settings.audioConsent ? crypto.randomUUID() : null;
    const records = candidates.map((candidate): StoredDetection => {
      const record: StoredDetection = { id: crypto.randomUUID(), species: candidate.scientificName, confidence: candidate.confidence, status: candidate.status === 'provisional' ? 'provisional' : 'confirmed', recorded_at: context.recordedAt, location: context.location, model_version: context.modelVersion, owner: settings.session?.userId ?? null, audioId: candidate.status === 'provisional' ? audioId : null, metadataSynced: false, bytes: 0 };
      record.bytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
      return record;
    });
    assertQueueCapacity(existing.reduce((sum, row) => sum + row.bytes, 0) + audio.reduce((sum, row) => sum + row.bytes, 0), records.reduce((sum, row) => sum + row.bytes, 0) + (audioId ? audioBlob?.size ?? 0 : 0), settings.maxBytes);
    for (const record of records) await request(tx.objectStore('detections').add(record));
    if (audioId && audioBlob) await request(tx.objectStore('audio').add({ id: audioId, blob: audioBlob, bytes: audioBlob.size } satisfies StoredAudio));
  });
}

/** Metadata acknowledgement is separate from audio delivery; unacknowledged rows stay intact. */
export async function acknowledge(ids: readonly string[], audioDelivered = false): Promise<void> {
  await transact(['detections', 'audio'], 'readwrite', async (tx) => {
    const store = tx.objectStore('detections');
    for (const id of ids) {
      const row = await request(store.get(id)) as StoredDetection | undefined;
      if (!row) continue;
      if (row.audioId && !audioDelivered) await request(store.put({ ...row, metadataSynced: true }));
      else await request(store.delete(id));
    }
    const remaining = await request(store.getAll()) as StoredDetection[];
    const audio = await request(tx.objectStore('audio').getAll()) as StoredAudio[];
    for (const row of audio) if (!remaining.some((record) => record.audioId === row.id)) await request(tx.objectStore('audio').delete(row.id));
  });
}
