import { useCallback, useState } from 'react';
import type { Period } from '../../config/contract';
import { saveFile } from '../../shared/download';
import { exportCsv } from './sitesApi';
import { exportFileNameFor, periodStart } from './siteText';

export type CsvExportState =
  | { readonly status: 'idle' | 'working' | 'failed' }
  | { readonly status: 'done'; readonly fileName: string; readonly truncated: boolean };

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
