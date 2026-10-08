import { useCallback, useState } from 'react';
import type { Period } from '../../config/contract';
import { DOWNLOAD_URL_RELEASE_MS } from './sites.config';
import { exportCsv } from './sitesApi';
import { exportFileNameFor, periodStart } from './siteText';

export type CsvExportState =
  | { readonly status: 'idle' | 'working' | 'failed' }
  | { readonly status: 'done'; readonly fileName: string; readonly truncated: boolean };

/** Hands the file to the browser's download manager; the object URL is released once the download has started. */
function saveFile(blob: Blob, fileName: string): void {
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

/**
 * CSV export of a site's detections in the chosen period (RF-16), counted back from the moment of the export and
 * saved under a name built from the site and the dates covered. An unknown name (site list not loaded yet) falls
 * back to a generic slug.
 */
export function useCsvExport(siteId: string, siteName: string, period: Period, token: string | null): { readonly state: CsvExportState; readonly run: () => Promise<void> } {
  const [state, setState] = useState<CsvExportState>({ status: 'idle' });

  const run = useCallback(async (): Promise<void> => {
    if (!token) return;
    setState({ status: 'working' });
    try {
      const now = new Date();
      const since = periodStart(period, now);
      const { blob, truncated } = await exportCsv(token, siteId, since);
      const fileName = exportFileNameFor(siteName, now, since);
      saveFile(blob, fileName);
      setState({ status: 'done', fileName, truncated });
    } catch {
      setState({ status: 'failed' });
    }
  }, [token, siteId, siteName, period]);

  return { state, run };
}
