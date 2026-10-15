import type { OfflineProgressCallback } from './offlineClient';

/**
 * Carries a download through its interruptions. The service worker keeps every finished piece of a model
 * (`verifiedDownload.ts`), so asking again goes on from there; and it is asked again without the person doing
 * anything, since the usual interruption is the browser stopping the worker when they leave the app for a moment.
 *
 * An attempt is repeated only while it got further than every one before it: a connection that is gone, or a
 * file that is not the published one, fails twice at the same point and is reported.
 */
export async function untilComplete<Result>(attempt: (progress: OfflineProgressCallback) => Promise<Result>, progress: OfflineProgressCallback): Promise<Result> {
  let furthest = 0;
  for (;;) {
    let reached = 0;
    try {
      return await attempt((received, total) => {
        reached = Math.max(reached, received);
        // A new attempt counts the kept pieces again from zero; what is shown never goes back.
        progress(Math.max(received, furthest), total);
      });
    } catch (error) {
      if (reached <= furthest) throw error;
      furthest = reached;
    }
  }
}
