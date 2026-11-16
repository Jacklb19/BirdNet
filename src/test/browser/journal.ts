import { bindSyncSession } from '../../features/offline/queueStore';
import { changeEntry, deleteEntity, deleteJournalOf, getPhoto, readJournal, saveEntity, savePhoto, setRelation } from '../../features/journal/journalStore';
import { refreshJournal, synchronizeJournal } from '../../features/journal/journalSync';
import { synchronizeQueue } from '../../features/offline/syncQueue';
import { importRecording } from '../../features/imports/importRecording';
import type { ImportResult } from '../../features/imports/importRecording';

export const journalChecks = {
  bindJournal: bindSyncSession, saveJournalEntity: saveEntity, deleteJournalEntity: deleteEntity, readJournal, changeJournalEntry: changeEntry,
  setJournalRelation: setRelation, synchronizeJournal, refreshJournal, saveJournalPhoto: savePhoto, getJournalPhoto: getPhoto, deleteJournalOf, synchronizeAll: synchronizeQueue,
  importReferenceFile: async (samples: readonly number[], owner: string, save: boolean, cancelAfter: number | null): Promise<ImportResult> => {
    const bytes = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(bytes);
    const word = (offset: number, text: string): void => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    word(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i] ?? 0)) * 32767), true);
    const controller = new AbortController();
    return importRecording(new File([bytes], 'reference.wav', { type: 'audio/wav', lastModified: 0 }), { owner, save, recordedAt: save ? '2025-03-04T10:06:00Z' : null, location: null, title: null },
      (progress) => { if (cancelAfter !== null && progress.windows >= cancelAfter) controller.abort(); }, controller);
  },
};
