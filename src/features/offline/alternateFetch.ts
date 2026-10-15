/**
 * Downloading the second model with the app closed (Background Fetch, which Chromium browsers have). The browser
 * downloads the files itself, shows the download among those of the system, goes on when the person leaves the
 * app and wakes the service worker at the end, which verifies and installs them (`alternateCache.ts`).
 *
 * Where the browser has no such thing, or does not take the download, the model is downloaded inside the app
 * (`alternateStore.ts`), which advances only while the app is open.
 */
import { offlineOperation } from './offlineClient';
import { ALTERNATE_FETCH_ID, BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS, BACKGROUND_FETCH_START_TIMEOUT_MS, OFFLINE_OPERATIONS } from './offline.constants';

// Background Fetch is not in the DOM library; the few members used here are declared locally.
export interface BackgroundDownload extends EventTarget {
  readonly downloaded: number;
  readonly downloadTotal: number;
  /** Empty while the download runs. */
  readonly result: '' | 'success' | 'failure';
  readonly failureReason: string;
  abort(): Promise<boolean>;
}
interface BackgroundFetchManager {
  fetch(id: string, requests: readonly string[], options: { readonly title: string; readonly downloadTotal: number }): Promise<BackgroundDownload>;
  get(id: string): Promise<BackgroundDownload | undefined>;
}

/**
 * How a background download ended. `cancelled` is the person stopping it from the downloads of the system;
 * `unstarted` is the browser never beginning it, and it has been cancelled here.
 */
export type BackgroundOutcome = 'success' | 'failure' | 'cancelled' | 'unstarted';

const ABORTED = 'aborted';

async function manager(): Promise<BackgroundFetchManager | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return 'backgroundFetch' in registration ? registration.backgroundFetch as BackgroundFetchManager : null;
}

/** The background download of the second model still running, such as one started before the app was closed. */
export async function runningAlternateFetch(): Promise<BackgroundDownload | null> {
  try {
    const running = await (await manager())?.get(ALTERNATE_FETCH_ID);
    return running?.result === '' ? running : null;
  } catch { return null; }
}

/**
 * Hands the download of the second model to the browser, under `title` among the downloads of the system. Null
 * when the browser has no background downloads or does not take this one; nothing is left running then.
 */
export async function startAlternateFetch(title: string): Promise<BackgroundDownload | null> {
  const fetches = await manager().catch(() => null);
  if (!fetches) return null;
  let started: Promise<BackgroundDownload> | null = null;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  try {
    const plan = await offlineOperation(OFFLINE_OPERATIONS.prepareAlternateFetch);
    started = fetches.fetch(ALTERNATE_FETCH_ID, plan.urls, { title, downloadTotal: plan.total });
    const late = new Promise<never>((_resolve, reject) => {
      waiting = setTimeout(() => { reject(new Error('Background download not accepted.')); }, BACKGROUND_FETCH_START_TIMEOUT_MS);
    });
    return await Promise.race([started, late]);
  } catch {
    // A browser that answers after all would download the model a second time next to the app.
    void started?.then((download) => download.abort()).catch(() => undefined);
    await offlineOperation(OFFLINE_OPERATIONS.forgetAlternateFetch).catch(() => undefined);
    return null;
  } finally {
    clearTimeout(waiting);
  }
}

/** Reports the bytes of a background download as they arrive and resolves with how it ended. */
export function followAlternateFetch(download: BackgroundDownload, progress: (received: number, total: number) => void): Promise<BackgroundOutcome> {
  return new Promise((resolve) => {
    const end = (outcome: BackgroundOutcome): void => {
      clearTimeout(waiting);
      download.removeEventListener('progress', read);
      resolve(outcome);
    };
    const read = (): void => {
      progress(download.downloaded, download.downloadTotal);
      if (download.result !== '') end(download.result === 'success' ? 'success' : download.failureReason === ABORTED ? 'cancelled' : 'failure');
    };
    // Once it has begun, a pause is left to the browser, which resumes its downloads when the connection returns.
    const waiting = setTimeout(() => {
      if (download.downloaded > 0 || download.result !== '') return;
      end('unstarted');
      void download.abort().catch(() => undefined);
    }, BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS);
    download.addEventListener('progress', read);
    read();
  });
}
