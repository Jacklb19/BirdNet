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

/** One walk kept on this phone, or null. */
export async function getWalk(id: string): Promise<StoredWalk | null> {
  if (!isUuid(id)) return null;
  return (await transact('readonly', (store) => request(store.get(id) as IDBRequest<StoredWalk | undefined>))) ?? null;
}

/**
 * Stores a walk (new, or a later state of the same one) and drops the oldest beyond `keep`. What the person or the
 * account sync set on a stored walk (its name and where it stands with the account) is kept unless `walk` sets it.
 */
export async function saveWalk(walk: StoredWalk, keep: number): Promise<void> {
  if (!isUuid(walk.id) || !Number.isFinite(Date.parse(walk.startedAt)) || !Number.isSafeInteger(keep) || keep < 1) throw new Error('Invalid walk.');
  await transact('readwrite', async (store) => {
    const stored = await request(store.get(walk.id) as IDBRequest<StoredWalk | undefined>);
    await request(store.put({ ...stored, ...walk }));
    const all = await request(store.getAll() as IDBRequest<StoredWalk[]>);
    const surplus = all.sort(oldestFirst).slice(0, Math.max(0, all.length - keep));
    for (const old of surplus) if (old.id !== walk.id) await request(store.delete(old.id));
  });
  announceQueueChange(['walks']);
}

/**
 * Changes a stored walk, unless it has changed since `expected` was read (then nothing is written and it resolves
 * false): the account sync must not mark as saved a version the person renamed meanwhile.
 */
export async function updateWalk(id: string, changes: Partial<Pick<StoredWalk, 'name' | 'owner' | 'account' | 'inAccount'>>, expected?: StoredWalk): Promise<boolean> {
  const written = await transact('readwrite', async (store) => {
    const stored = await request(store.get(id) as IDBRequest<StoredWalk | undefined>);
    if (!stored || (expected && JSON.stringify(stored) !== JSON.stringify(expected))) return false;
    await request(store.put({ ...stored, ...changes }));
    return true;
  });
  if (written) announceQueueChange(['walks']);
  return written;
}

/** Forgets a walk on this phone; its songs are detections of their own and stay. */
export async function deleteWalk(id: string): Promise<void> {
  await transact('readwrite', (store) => request(store.delete(id)));
  announceQueueChange(['walks']);
}

/**
 * After the account's walks were deleted: the copies on this phone stay, and are not sent again (the person removed
 * them from the account on purpose).
 */
export async function forgetAccountCopies(): Promise<void> {
  await transact('readwrite', async (store) => {
    const all = await request(store.getAll() as IDBRequest<StoredWalk[]>);
    for (const walk of all) {
      if (walk.inAccount || walk.account === 'saved') await request(store.put({ ...walk, account: 'phoneOnly', inAccount: false }));
    }
  });
  announceQueueChange(['walks']);
}
