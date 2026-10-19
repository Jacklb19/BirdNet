/**
 * Browsers may read a download's object URL after the click returns, so it is released a little later
 * instead of immediately.
 */
const DOWNLOAD_URL_RELEASE_MS = 1_000;

/** Hands a file to the browser's download manager; the object URL is released once the download has started. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => { URL.revokeObjectURL(url); }, DOWNLOAD_URL_RELEASE_MS);
}
