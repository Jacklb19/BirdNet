// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followAlternateFetch, type BackgroundDownload } from './alternateFetch';
import { BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS } from './offline.constants';

const TOTAL = 100;

/** A background download as the browser exposes it, moved by hand. */
class FakeDownload extends EventTarget {
  downloaded = 0;
  readonly downloadTotal = TOTAL;
  result: BackgroundDownload['result'] = '';
  failureReason = '';
  readonly abort = vi.fn(() => Promise.resolve(true));

  advance(downloaded: number, result: BackgroundDownload['result'] = '', failureReason = ''): void {
    Object.assign(this, { downloaded, result, failureReason });
    this.dispatchEvent(new Event('progress'));
  }
}

describe('following a background download of the second model', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports the bytes as they arrive and how it ended', async () => {
    const download = new FakeDownload();
    const progress = vi.fn();
    const outcome = followAlternateFetch(download, progress);
    download.advance(40);
    download.advance(TOTAL, 'success');
    await expect(outcome).resolves.toBe('success');
    expect(progress.mock.calls).toEqual([[0, TOTAL], [40, TOTAL], [TOTAL, TOTAL]]);
  });

  it('tells a download the person stopped from one that failed', async () => {
    const stopped = new FakeDownload();
    const stoppedOutcome = followAlternateFetch(stopped, () => undefined);
    stopped.advance(40, 'failure', 'aborted');
    await expect(stoppedOutcome).resolves.toBe('cancelled');
    const failed = new FakeDownload();
    const failedOutcome = followAlternateFetch(failed, () => undefined);
    failed.advance(40, 'failure', 'fetch-error');
    await expect(failedOutcome).resolves.toBe('failure');
  });

  // Regression: a browser without a place to show downloads accepted the download and never began it.
  it('cancels a download the browser never begins, so it can be made inside the app', async () => {
    const download = new FakeDownload();
    const outcome = followAlternateFetch(download, () => undefined);
    await vi.advanceTimersByTimeAsync(BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('unstarted');
    expect(download.abort).toHaveBeenCalledTimes(1);
  });

  it('leaves a download that has begun to the browser, however long it pauses', async () => {
    const download = new FakeDownload();
    let ended = false;
    void followAlternateFetch(download, () => undefined).then(() => { ended = true; });
    download.advance(1);
    await vi.advanceTimersByTimeAsync(BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS * 10);
    expect(ended).toBe(false);
    expect(download.abort).not.toHaveBeenCalled();
  });
});
