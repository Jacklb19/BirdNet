import { useEffect, useState } from 'react';
import { useQueueVersion } from '../offline/useQueueVersion';
import { listNotes } from './noteStore';
import type { StoredNote } from './notePolicy';

const NO_NOTES: ReadonlyMap<string, StoredNote> = new Map();

/** The notes kept on this phone, by detection id; read again after every change. Null while the first read runs. */
export function useNotes(): ReadonlyMap<string, StoredNote> | null {
  const version = useQueueVersion('notes');
  const [notes, setNotes] = useState<ReadonlyMap<string, StoredNote> | null>(() => (typeof indexedDB === 'undefined' ? NO_NOTES : null));

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    listNotes().then((stored) => { if (active) setNotes(new Map(stored.map((note) => [note.id, note]))); })
      .catch(() => { if (active) setNotes(NO_NOTES); });
    return () => { active = false; };
  }, [version]);

  return notes;
}
