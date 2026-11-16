import { isUuid } from '../../config/contract';
import { announceQueueChange } from '../offline/queueChanges';
import { clipsToEvict } from './recordingPolicy';
import { RECORDINGS_DATABASE, RECORDINGS_STORE } from './recordings.config';
import type { RecordingUpload, StoredRecording } from './types';

const KEY_PATH = 'id' satisfies keyof StoredRecording;
export type RecordingMetadata = Omit<StoredRecording, 'blob'>;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => { resolve(operation.result); };
    operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); };
  });
}

/**
 * Clips live in a database of their own, apart from the synchronization queue: adding them there would have
 * raised that database's version, and a service worker of the previous release, still running during an update,
 * could then no longer open the queue it has to send (same reason as the walks, ADR-25).
 */
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(RECORDINGS_DATABASE);
  operation.onupgradeneeded = () => {
    if (!operation.result.objectStoreNames.contains(RECORDINGS_STORE)) operation.result.createObjectStore(RECORDINGS_STORE, { keyPath: KEY_PATH });
  };
  return request(operation);
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    const transaction = db.transaction([RECORDINGS_STORE], mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => { resolve(); };
      transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); };
    });
    const result = await action(transaction.objectStore(RECORDINGS_STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/** Iterate without retaining every audio Blob in memory; eviction and usage only need metadata. */
function metadata(store: IDBObjectStore): Promise<RecordingMetadata[]> {
  return new Promise((resolve, reject) => {
    const rows: RecordingMetadata[] = [];
    const operation = store.openCursor();
    operation.onerror = () => { reject(operation.error ?? new Error('Recording metadata could not be read.')); };
    operation.onsuccess = () => {
      const cursor = operation.result;
      if (!cursor) { resolve(rows); return; }
      const { id, species, recordedAt, bytes, upload } = cursor.value as StoredRecording;
      rows.push({ id, species, recordedAt, bytes, upload });
      cursor.continue();
    };
  });
}

/**
 * Stores a clip, first dropping `replaces` (the clip the same song kept until now) and then the oldest clips
 * that no longer fit in `maxBytes`.
 */
export async function saveRecording(recording: StoredRecording, maxBytes: number, replaces: string | null = null): Promise<void> {
  if (!isUuid(recording.id) || !Number.isFinite(Date.parse(recording.recordedAt)) || recording.bytes !== recording.blob.size || recording.bytes > maxBytes) throw new Error('Invalid recording.');
  await transact('readwrite', async (store) => {
    if (replaces) await request(store.delete(replaces));
    const stored = (await metadata(store)).filter((clip) => clip.id !== recording.id);
    for (const id of clipsToEvict(stored, recording.bytes, maxBytes)) await request(store.delete(id));
    await request(store.put(recording));
  });
  announceQueueChange(['recordings']);
}

export async function getRecording(id: string): Promise<StoredRecording | undefined> {
  return transact('readonly', (store) => request(store.get(id) as IDBRequest<StoredRecording | undefined>));
}

/** Metadata of every clip on this phone, oldest first. Load a Blob only when playing or sending that clip. */
export async function listRecordings(): Promise<RecordingMetadata[]> {
  const clips = await transact('readonly', metadata);
  return clips.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

/** Records how the upload of a clip ended; a clip deleted meanwhile stays deleted. */
export async function markRecording(id: string, upload: RecordingUpload): Promise<void> {
  await transact('readwrite', async (store) => {
    const clip = await request(store.get(id) as IDBRequest<StoredRecording | undefined>);
    if (clip) await request(store.put({ ...clip, upload }));
  });
  announceQueueChange(['recordings']);
}

export async function deleteRecording(id: string): Promise<void> {
  await transact('readwrite', (store) => request(store.delete(id)));
  announceQueueChange(['recordings']);
}

export async function deleteAllRecordings(): Promise<void> {
  await transact('readwrite', (store) => request(store.clear()));
  announceQueueChange(['recordings']);
}

/** Account cleanup retains the clips of every other account on this phone, including unsent ones. */
export async function deleteRecordingsExcept(retained: ReadonlySet<string>): Promise<void> {
  await transact('readwrite', async (store) => {
    for (const id of await request(store.getAllKeys())) {
      if (typeof id !== 'string' || !retained.has(id)) await request(store.delete(id));
    }
  });
  announceQueueChange(['recordings']);
}
