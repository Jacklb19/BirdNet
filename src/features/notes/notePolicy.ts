/** Rules of a note and its count, shared by the store, its synchronization, the record screen and the CSV. */
import { NOTE_LIMITS } from '../../config/contract';

/** What the person wrote about one record; both empty means there is no note. */
export interface NoteContent {
  readonly note: string | null;
  readonly individuals: number | null;
}

/** How far a note is on its way to the account, as for a verdict. */
export type NoteSync = 'pending' | 'done' | 'rejected';

/** A note kept on this phone under the id of its detection. */
export interface StoredNote extends NoteContent {
  /** Id of the detection. */
  readonly id: string;
  /** ISO timestamp of the last change; also tells a newer note from the one that was being sent. */
  readonly writtenAt: string;
  readonly sync: NoteSync;
}

export const EMPTY_NOTE: NoteContent = Object.freeze({ note: null, individuals: null });

/** Surrounding spaces and blank lines are noise, and an all-blank note is no note, as in the API. */
export function cleanNote(typed: string): string | null {
  const trimmed = typed.trim();
  return trimmed ? trimmed : null;
}

export function isValidNote(content: NoteContent): boolean {
  const { note, individuals } = content;
  const noteOk = note === null || (note.length > 0 && note.length <= NOTE_LIMITS.noteLength && note === note.trim());
  const countOk = individuals === null
    || (Number.isInteger(individuals) && individuals >= NOTE_LIMITS.minIndividuals && individuals <= NOTE_LIMITS.maxIndividuals);
  return noteOk && countOk;
}

/** Body of the note request: the whole note, so sending it twice changes nothing. */
export function notePayload(content: NoteContent): NoteContent {
  return { note: content.note, individuals: content.individuals };
}
