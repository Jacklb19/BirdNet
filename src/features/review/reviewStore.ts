import { isUuid } from '../../config/contract';
import { announceQueueChange } from '../offline/queueChanges';
import { REVIEWS_DATABASE, REVIEWS_STORE } from './review.config';
import { isValidVerdict, type Verdict } from './reviewPolicy';
import type { ReviewSync, StoredReview } from './types';

const KEY_PATH = 'id' satisfies keyof StoredReview;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => { resolve(operation.result); };
    operation.onerror = () => { reject(operation.error ?? new Error('Storage request failed.')); };
  });
}

/**
 * Verdicts live in a database of their own, apart from the synchronization queue: adding them there would have
 * raised the version of that database, and a service worker of the previous release, still running during an
 * update, could then no longer open the queue it has to send (same reason as the walks, ADR-25).
 */
async function open(): Promise<IDBDatabase> {
  const operation = indexedDB.open(REVIEWS_DATABASE);
  operation.onupgradeneeded = () => {
    if (!operation.result.objectStoreNames.contains(REVIEWS_STORE)) operation.result.createObjectStore(REVIEWS_STORE, { keyPath: KEY_PATH });
  };
  return request(operation);
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    const transaction = db.transaction([REVIEWS_STORE], mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => { resolve(); };
      transaction.onabort = transaction.onerror = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); };
    });
    const result = await action(transaction.objectStore(REVIEWS_STORE));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/** Stores the latest verdict on a detection, replacing an earlier one; it waits to be sent again. */
export async function saveReview(detectionId: string, verdict: Verdict): Promise<void> {
  if (!isUuid(detectionId) || !isValidVerdict(verdict.action, verdict.species)) throw new Error('Invalid review.');
  const stored: StoredReview = { id: detectionId, action: verdict.action, species: verdict.species, reviewedAt: new Date().toISOString(), sync: 'pending' };
  await transact('readwrite', (store) => request(store.put(stored)));
  announceQueueChange(['reviews']);
}

export async function listReviews(): Promise<StoredReview[]> {
  return transact('readonly', (store) => request(store.getAll() as IDBRequest<StoredReview[]>));
}

/**
 * Records how sending a verdict ended, unless the person has changed it since it was read (`reviewedAt`): the
 * newer verdict is still to be sent.
 */
export async function markReview(sent: Pick<StoredReview, 'id' | 'reviewedAt'>, sync: ReviewSync): Promise<void> {
  await transact('readwrite', async (store) => {
    const current = await request(store.get(sent.id) as IDBRequest<StoredReview | undefined>);
    if (current?.reviewedAt === sent.reviewedAt) await request(store.put({ ...current, sync }));
  });
  announceQueueChange(['reviews']);
}
