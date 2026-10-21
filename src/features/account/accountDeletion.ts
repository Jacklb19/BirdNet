import { API_ROUTES, apiFetch } from '../../config/api';
import { JSON_HEADERS } from '../offline/offline.constants';
import { forgetAccountRecords } from '../offline/queueStore';
import { deleteAllRecordings } from '../recordings/recordingStore';
import { deleteAllReviews } from '../review/reviewStore';
import { deleteWalksOf } from '../walk/walkStore';

/** The fixed word the API asks for, so a request sent by mistake deletes nothing (`AccountDeletion` in the API). */
const DELETE_CONFIRMATION = 'DELETE';

/** How far a deletion got: the phone is cleaned only once the account is gone, never before. */
export type DeletionOutcome = 'done' | 'phoneKept';

/**
 * Deletes the account and everything in it (ADR-38): the API removes the photo and the recordings from Storage, then
 * the user, whose removal takes every row of the account with it. Only after its answer does this phone forget what it
 * keeps of the account: its records, history, clips, verdicts, walks, sites and session. Downloaded models, photos and
 * texts of public sources, and the theme and language stay: none of them is the person's data.
 */
export async function deleteAccount(token: string, userId: string): Promise<DeletionOutcome> {
  await apiFetch(API_ROUTES.me, { token, method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ confirmation: DELETE_CONFIRMATION }) });
  try {
    await forgetAccountOnPhone(userId);
    return 'done';
  } catch {
    // The account is already gone; the person is told that some of it may still be on this phone.
    return 'phoneKept';
  }
}

export async function forgetAccountOnPhone(userId: string): Promise<void> {
  await forgetAccountRecords(userId);
  await deleteWalksOf(userId);
  await deleteAllRecordings();
  await deleteAllReviews();
}
