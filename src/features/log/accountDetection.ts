/**
 * A song kept only in the account (ADR-44): recorded on another phone, or older than what this phone keeps. It is read,
 * reviewed and annotated straight against the API, so nothing of it enters this phone's queue or its synchronization.
 */
import { API_ROUTES, apiFetch } from '../../config/api';
import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import { notePayload, type NoteContent } from '../notes/notePolicy';
import type { QueuedDetectionStatus } from '../offline/offline.constants';
import { JSON_HEADERS } from '../offline/offline.constants';
import { reviewPayload, type Verdict } from '../review/reviewPolicy';
import type { ReviewAction } from '../review/types';
import type { LogRecord } from './logRecords';

export interface AccountDetection {
  readonly record: LogRecord;
  readonly note: NoteContent;
  readonly hasRecording: boolean;
  readonly siteName: string | null;
}

const REVIEW_BY_STATUS: Readonly<Record<string, ReviewAction>> = Object.freeze({ verified: 'confirm', corrected: 'correct', discarded: 'discard' });
const MODEL_STATUSES: readonly string[] = ['confirmed', 'provisional'];

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);

/** What the model said, as the log shows it: a reviewed song keeps the state its confidence gave it. */
function modelStatus(status: string, confidence: number): QueuedDetectionStatus {
  if (MODEL_STATUSES.includes(status)) return status as QueuedDetectionStatus;
  return confidence >= CONFIDENCE_THRESHOLDS.confirmedFrom ? 'confirmed' : 'provisional';
}

/** One detection of the account as the log shows it, or null when the answer does not follow the contract. */
export function parseAccountDetection(value: unknown): AccountDetection | null {
  const row = value as Record<string, unknown> | null;
  if (!row || !isText(row.id) || !isText(row.species) || typeof row.confidence !== 'number' || !Number.isFinite(row.confidence)
      || !isText(row.status) || !(MODEL_STATUSES.includes(row.status) || row.status in REVIEW_BY_STATUS)
      || !isText(row.recorded_at) || Number.isNaN(Date.parse(row.recorded_at)) || !isTextOrNull(row.model_species)
      || !isTextOrNull(row.site_id) || !isTextOrNull(row.site_name) || !isTextOrNull(row.note)
      || !(row.individuals === null || (typeof row.individuals === 'number' && Number.isSafeInteger(row.individuals)))
      || typeof row.has_recording !== 'boolean') {
    return null;
  }
  return {
    record: {
      id: row.id, species: row.species, confidence: row.confidence, status: modelStatus(row.status, row.confidence),
      recordedAt: Date.parse(row.recorded_at), siteId: row.site_id, upload: 'cloud', located: true,
      review: REVIEW_BY_STATUS[row.status] ?? null, modelSpecies: row.model_species,
    },
    note: { note: row.note, individuals: row.individuals },
    hasRecording: row.has_recording,
    siteName: row.site_name,
  };
}

export async function fetchAccountDetection(token: string, id: string, signal?: AbortSignal): Promise<AccountDetection> {
  const found = parseAccountDetection(await (await apiFetch(API_ROUTES.meDetection(id), { token, signal })).json());
  if (!found) throw new Error('Invalid detection of the account.');
  return found;
}

/** The verdict as a whole, as the synchronization sends it: repeating it after a lost answer changes nothing. */
export async function reviewAccountDetection(token: string, id: string, verdict: Verdict): Promise<void> {
  await apiFetch(API_ROUTES.detection(id), { method: 'PATCH', token, headers: JSON_HEADERS, body: JSON.stringify(reviewPayload(verdict)) });
}

export async function saveAccountNote(token: string, id: string, content: NoteContent): Promise<void> {
  await apiFetch(API_ROUTES.detectionNote(id), { method: 'PUT', token, headers: JSON_HEADERS, body: JSON.stringify(notePayload(content)) });
}
