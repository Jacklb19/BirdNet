import { isUuid } from '../../config/contract';
import { announceQueueChange } from '../offline/queueChanges';
import { NOTES_DATABASE, NOTES_STORE } from './notes.config';
import { isValidNote, type NoteContent, type NoteSync, type StoredNote } from './notePolicy';

const KEY_PATH = 'id' satisfies keyof StoredNote;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => { resolve(operation.result); };
    operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); };
  });
}

/**
 * Notes live in a database of their own, like verdicts and walks: adding them to the synchronization queue would
 * raise its version, and a service worker of the previous release could then no longer open it during an update.
 */
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(NOTES_DATABASE);
  operation.onupgradeneeded = () => {
    if (!operation.result.objectStoreNames.contains(NOTES_STORE)) operation.result.createObjectStore(NOTES_STORE, { keyPath: KEY_PATH });
  };
  return request(operation);
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    const transaction = db.transaction([NOTES_STORE], mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => { resolve(); };
      transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); };
    });
    const result = await action(transaction.objectStore(NOTES_STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/**
 * Stores the whole note of a detection, replacing the earlier one; it waits to be sent again. An empty note is kept
 * too until it is sent, so the account deletes its copy.
 */
export async function saveNote(detectionId: string, content: NoteContent): Promise<void> {
  if (!isUuid(detectionId) || !isValidNote(content)) throw new Error('Invalid note.');
  const stored: StoredNote = { id: detectionId, note: content.note, individuals: content.individuals, writtenAt: new Date().toISOString(), sync: 'pending' };
  await transact('readwrite', (store) => request(store.put(stored)));
  announceQueueChange(['notes']);
}

export async function listNotes(): Promise<StoredNote[]> {
  return transact('readonly', (store) => request(store.getAll() as IDBRequest<StoredNote[]>));
}

/** Records how sending a note ended, unless the person changed it since it was read (`writtenAt`). */
export async function markNote(sent: Pick<StoredNote, 'id' | 'writtenAt'>, sync: NoteSync): Promise<void> {
  await transact('readwrite', async (store) => {
    const current = await request(store.get(sent.id) as IDBRequest<StoredNote | undefined>);
    if (current?.writtenAt === sent.writtenAt) await request(store.put({ ...current, sync }));
  });
  announceQueueChange(['notes']);
}

/** After the account was deleted (ADR-38): notes keep no owner, and on this phone they are the account's. */
export async function deleteAllNotes(): Promise<void> {
  await transact('readwrite', (store) => request(store.clear()));
  announceQueueChange(['notes']);
}
