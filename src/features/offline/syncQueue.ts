import { acknowledgedIds } from './queuePolicy';
import { acknowledge, getAudio, getSettings, listDetections } from './queueStore';
import type { StoredDetection, SyncSession } from './types';

const configuredBase: unknown = import.meta.env.VITE_API_BASE_URL;
const API_BASE = typeof configuredBase === 'string' && configuredBase ? configuredBase : '/api';
function payload(row: StoredDetection, audioPath?: string): object {
  return { id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at, location: row.location, model_version: row.model_version, ...(audioPath ? { audio_path: audioPath } : {}) };
}
async function send(rows: StoredDetection[], session: SyncSession, audioPath?: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/v1/detections/batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ detections: rows.map((row) => payload(row, audioPath)) }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Synchronization failed.');
  return acknowledgedIds(await response.json(), rows.map((row) => row.id));
}
async function sessionFor(userId: string, requireConsent = false): Promise<SyncSession | null> {
  const settings = await getSettings();
  const session = settings.session;
  if (!session || session.userId !== userId || session.expiresAt * 1000 <= Date.now() || (requireConsent && !settings.audioConsent)) return null;
  return session;
}

/** Web Locks serialize foreground retries with Background Sync; UUIDs also protect the server. */
export async function synchronizeQueue(): Promise<void> {
  await navigator.locks.request('birdnet-sync', async () => {
    const settings = await getSettings();
    const session = settings.session;
    if (!session || session.expiresAt * 1000 <= Date.now()) return;
    const records = (await listDetections()).filter((row) => row.owner === session.userId && row.location);
    for (let offset = 0; offset < records.length; offset += 50) {
      const current = await sessionFor(session.userId);
      if (!current) return;
      const batch = records.slice(offset, offset + 50).filter((row) => !row.metadataSynced);
      if (batch.length) await acknowledge(await send(batch, current));
    }
    const audioRecords = (await listDetections()).filter((row) => row.owner === session.userId && row.location && row.audioId && row.metadataSynced);
    for (const row of audioRecords) {
      const current = await sessionFor(session.userId, true);
      if (!current || !row.audioId) return;
      const audio = await getAudio(row.audioId);
      if (!audio) throw new Error('Queued audio is missing.');
      const signed = await fetch(`${API_BASE}/v1/detections/${row.id}/audio-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.accessToken}` },
        body: JSON.stringify({ content_type: 'audio/wav', size_bytes: audio.bytes }), signal: AbortSignal.timeout(30000),
      });
      if (!signed.ok) throw new Error('Audio upload authorization failed.');
      const result: unknown = await signed.json();
      if (!result || typeof result !== 'object' || !('upload_url' in result) || typeof result.upload_url !== 'string' || !('audio_path' in result) || result.audio_path !== `${current.userId}/${row.id}.wav`) throw new Error('Invalid upload authorization.');
      const uploadUrl = new URL(result.upload_url, self.location.origin);
      if (uploadUrl.origin !== self.location.origin && !(uploadUrl.protocol === 'https:' && uploadUrl.hostname.endsWith('.supabase.co'))) throw new Error('Untrusted upload origin.');
      if (!await sessionFor(session.userId, true)) return;
      const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/wav', 'x-upsert': 'true' }, body: audio.blob, signal: AbortSignal.timeout(30000) });
      if (!upload.ok) throw new Error('Audio upload failed.');
      const finalSession = await sessionFor(session.userId, true);
      if (!finalSession) return;
      await acknowledge(await send([row], finalSession, result.audio_path), true);
    }
  });
}
