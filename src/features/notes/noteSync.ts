import { API_ROUTES, ApiError, apiFetch } from '../../config/api';
import { JSON_HEADERS } from '../offline/offline.constants';
import { getSettings, listHistory } from '../offline/queueStore';
import type { OfflineSettings, SyncSession } from '../offline/types';
import { notePayload } from './notePolicy';
import { listNotes, markNote } from './noteStore';

const HTTP_NOT_FOUND = 404;
const MILLISECONDS_PER_SECOND = 1000;

function liveSession(settings: OfflineSettings, userId: string): SyncSession | null {
  const session = settings.session;
  return session && session.userId === userId && session.expiresAt * MILLISECONDS_PER_SECOND > Date.now() ? session : null;
}

/**
 * Sends the notes still on the phone whose detection the server already has. Runs inside the synchronization lock,
 * after the detections. The request carries the whole note, so repeating it after a lost answer changes nothing.
 */
export async function syncNotes(userId: string): Promise<void> {
  const pending = (await listNotes()).filter((note) => note.sync === 'pending');
  if (pending.length === 0) return;
  const acknowledged = new Set((await listHistory()).map((entry) => entry.id));
  for (const note of pending.filter((candidate) => acknowledged.has(candidate.id))) {
    const session = liveSession(await getSettings(), userId);
    if (!session) return;
    try {
      await apiFetch(API_ROUTES.detectionNote(note.id), { method: 'PUT', token: session.accessToken, headers: JSON_HEADERS, body: JSON.stringify(notePayload(note)) });
      await markNote(note, 'done');
    } catch (error) {
      // Not a detection of this account: the note stays on the phone and is not sent again.
      if (!(error instanceof ApiError) || error.status !== HTTP_NOT_FOUND) throw error;
      await markNote(note, 'rejected');
    }
  }
}
