import { isUuid } from '../../config/contract';
import { announceQueueChange } from '../offline/queueChanges';
import type { StoredWalk } from '../offline/types';
import { WALKS_DATABASE, WALKS_STORE } from './walk.config';

const KEY_PATH = 'id' satisfies keyof StoredWalk;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => { resolve(operation.result); };
    operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); };
  });
}

/**
 * Walks live in a database of their own, apart from the synchronization queue: adding them there would have
 * raised that database's version, and a service worker of the previous release, still running during an update,
 * could then no longer open the queue it has to send.
 */
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(WALKS_DATABASE);
  operation.onupgradeneeded = () => {
    if (!operation.result.objectStoreNames.contains(WALKS_STORE)) operation.result.createObjectStore(WALKS_STORE, { keyPath: KEY_PATH });
  };
  return request(operation);
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    const transaction = db.transaction([WALKS_STORE], mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => { resolve(); };
      transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); };
    });
    const result = await action(transaction.objectStore(WALKS_STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

const oldestFirst = (a: StoredWalk, b: StoredWalk): number => a.startedAt.localeCompare(b.startedAt);

/** Walks kept on this phone, oldest first. */
export async function listWalks(): Promise<StoredWalk[]> {
  const walks = await transact('readonly', (store) => request(store.getAll() as IDBRequest<StoredWalk[]>));
  return walks.sort(oldestFirst);
}

/** Stores a walk (new, or a later state of the same one) and drops the oldest beyond `keep`. */
export async function saveWalk(walk: StoredWalk, keep: number): Promise<void> {
  if (!isUuid(walk.id) || !Number.isFinite(Date.parse(walk.startedAt)) || !Number.isSafeInteger(keep) || keep < 1) throw new Error('Invalid walk.');
  await transact('readwrite', async (store) => {
    await request(store.put(walk));
    const all = await request(store.getAll() as IDBRequest<StoredWalk[]>);
    const surplus = all.sort(oldestFirst).slice(0, Math.max(0, all.length - keep));
    for (const old of surplus) if (old.id !== walk.id) await request(store.delete(old.id));
  });
  announceQueueChange(['walks']);
}
