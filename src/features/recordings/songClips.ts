import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { getSettings } from '../offline/queueStore';
import type { StoredDetection } from '../offline/types';
import { canEncodeClips, encodeClip } from './encodeClip';
import { decideClip, type SongClip } from './recordingPolicy';
import { saveRecording } from './recordingStore';
import { LOCAL_RECORDINGS_MAX_BYTES, SONG_GAP_MS, SONG_MAX_MS } from './recordings.config';

const SONG_LIMITS = Object.freeze({ gapMs: SONG_GAP_MS, maxMs: SONG_MAX_MS });

/** The clip the current song of each species keeps; lives as long as the model of the inference worker. */
const songs = new Map<string, SongClip>();
/** Asked once: the answer does not change while the page lives. */
let canEncode: Promise<boolean> | null = null;
/** Windows are handled one after another, so the clip of a song is never replaced out of order. */
let pending: Promise<void> = Promise.resolve();

async function keep(records: readonly StoredDetection[], samples: Float32Array): Promise<void> {
  // Keeping clips on the phone is on unless the person turned it off.
  if ((await getSettings()).keepRecordings === false) return;
  canEncode ??= canEncodeClips(AUDIO_CONSTANTS.TARGET_SAMPLE_RATE);
  if (!await canEncode) return;
  let clip: Blob | null = null;
  for (const record of records) {
    const previous = songs.get(record.species);
    const decision = decideClip(previous, { detectionId: record.id, confidence: record.confidence, recordedAt: Date.parse(record.recorded_at) }, SONG_LIMITS);
    songs.set(record.species, decision.song);
    if (decision.action === 'skip') continue;
    // Two species heard in the same window share its audio: it is compressed once.
    clip ??= await encodeClip(samples, AUDIO_CONSTANTS.TARGET_SAMPLE_RATE);
    await saveRecording(
      { id: record.id, species: record.species, recordedAt: record.recorded_at, blob: clip, bytes: clip.size, upload: 'pending' },
      LOCAL_RECORDINGS_MAX_BYTES, decision.action === 'replace' ? previous?.detectionId ?? null : null,
    );
  }
}

/**
 * Keeps the clip of the window for the detections that start a song or improve on its clip (`recordingPolicy.ts`).
 * Called by the inference worker for every stored window; never rejects, because a detection is complete without
 * its clip.
 */
export function keepSongClips(records: readonly StoredDetection[], samples: Float32Array): void {
  if (records.length === 0) return;
  pending = pending.then(() => keep(records, samples)).catch(() => undefined);
}

/** Forgets the songs in progress; the next detection of every species starts a new one. */
export function forgetSongs(): void {
  songs.clear();
}
