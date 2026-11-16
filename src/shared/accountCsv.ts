import { API_ROUTES, apiFetch, EXPORT_CURSOR_HEADERS, TRUNCATED_HEADER } from '../config/api';
import { isUuid } from '../config/contract';

/** Collect bounded CSV pages, retaining a single header and the server's compatibility with older clients. */
export async function downloadAccountCsv(token: string, filters = new URLSearchParams()): Promise<{ blob: Blob; truncated: boolean }> {
  const params = new URLSearchParams(filters);
  const parts: Blob[] = [];
  const cursors = new Set<string>();
  for (;;) {
    const response = await apiFetch(API_ROUTES.export, { token, params });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const headerEnd = bytes.indexOf(10) + 1;
    if (headerEnd === 0) throw new Error('Invalid CSV page.');
    parts.push(new Blob([parts.length ? bytes.subarray(headerEnd) : bytes], { type: 'text/csv;charset=utf-8' }));
    const truncated = response.headers.get(TRUNCATED_HEADER) === 'true';
    if (!truncated) return { blob: new Blob(parts, { type: 'text/csv;charset=utf-8' }), truncated: false };
    const after = response.headers.get(EXPORT_CURSOR_HEADERS.after);
    const id = response.headers.get(EXPORT_CURSOR_HEADERS.id);
    // An older API can return a partial file but no cursor; its warning must remain visible.
    if (after === null && id === null) return { blob: new Blob(parts, { type: 'text/csv;charset=utf-8' }), truncated: true };
    if (!after || !id || !Number.isFinite(Date.parse(after)) || !isUuid(id)) throw new Error('Invalid CSV cursor.');
    const key = `${after}:${id}`;
    if (cursors.has(key)) throw new Error('CSV pagination did not advance.');
    cursors.add(key);
    params.set('after', after);
    params.set('after_id', id);
  }
}
