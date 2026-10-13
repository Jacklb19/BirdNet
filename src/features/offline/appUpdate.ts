/**
 * Bringing a new version of the app into use. The service worker keeps the app shell for offline use, and a
 * browser normally holds a new worker back while any tab runs under the previous one: a person who never closes
 * the app would keep the old version however often they reload it. So the worker of a new version takes over as
 * soon as the browser lets it (`service-worker.ts`), and from then on every reload and every new visit gets the
 * new version.
 *
 * The page that was open when that happened still runs the code of the previous version. It is never reloaded
 * under the person, which would cut a listening session or lose what they were typing: it offers the new version
 * (`updateReady`) and reloads when they take it.
 */
import { UPDATE_CHECK_INTERVAL_MS } from './offline.constants';

let ready = false;
const listeners = new Set<() => void>();

/** Whether a new version took over while this page was open, so reloading brings it in. */
export function updateReady(): boolean {
  return ready;
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reloads the page, which comes back as the new version. */
export function applyUpdate(): void {
  window.location.reload();
}

/** Follows the registration from now on; called once, when the page registers the worker. */
export function watchForUpdates(registration: ServiceWorkerRegistration): void {
  const container = navigator.serviceWorker;
  // On a first visit the page starts without a worker: the first one to take it is not a new version.
  let controlled = container.controller !== null;
  container.addEventListener('controllerchange', () => {
    if (controlled) {
      ready = true;
      for (const listener of [...listeners]) listener();
    }
    controlled = true;
  });
  // The browser looks for a new version when the app is opened; an app left open for days is asked now and then.
  let checkedAt = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - checkedAt < UPDATE_CHECK_INTERVAL_MS) return;
    checkedAt = Date.now();
    void registration.update().catch(() => undefined);
  });
}
