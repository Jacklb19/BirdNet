/**
 * Which detections keep a clip. Analysis windows overlap and a bird repeats itself, so one song produces many
 * detections; keeping a clip for each would store the same sound over and over. A song keeps one clip, that of
 * the window where the model was most confident.
 */

/** The clip a song is keeping so far. */
export interface SongClip {
  /** Detection the clip belongs to. */
  readonly detectionId: string;
  readonly confidence: number;
  /** When the song started and when its species was last heard, in epoch milliseconds. */
  readonly startedAt: number;
  readonly lastHeardAt: number;
}

export interface HeardDetection {
  readonly detectionId: string;
  readonly confidence: number;
  /** Epoch milliseconds. */
  readonly recordedAt: number;
}

export interface SongLimits {
  /** Silence from the species after which the next detection is a new song. */
  readonly gapMs: number;
  /** Longest a song lasts before the next detection starts another. */
  readonly maxMs: number;
}

/**
 * What to do with the clip of a new detection of a species, given the clip its current song keeps:
 * - `keep`: a new song starts; store this clip.
 * - `replace`: same song, heard more clearly; store this clip and drop the song's previous one.
 * - `skip`: same song, no clearer than what is kept.
 */
export interface ClipDecision {
  readonly action: 'keep' | 'replace' | 'skip';
  /** The song after this detection, to pass back with the next one. */
  readonly song: SongClip;
}

export function decideClip(current: SongClip | undefined, heard: HeardDetection, limits: SongLimits): ClipDecision {
  const sameSong = current !== undefined && heard.recordedAt >= current.lastHeardAt &&
    heard.recordedAt - current.lastHeardAt <= limits.gapMs && heard.recordedAt - current.startedAt <= limits.maxMs;
  if (!sameSong) {
    return { action: 'keep', song: { detectionId: heard.detectionId, confidence: heard.confidence, startedAt: heard.recordedAt, lastHeardAt: heard.recordedAt } };
  }
  if (heard.confidence > current.confidence) {
    return { action: 'replace', song: { ...current, detectionId: heard.detectionId, confidence: heard.confidence, lastHeardAt: heard.recordedAt } };
  }
  return { action: 'skip', song: { ...current, lastHeardAt: heard.recordedAt } };
}

export interface StoredClipSize {
  readonly id: string;
  readonly bytes: number;
  /** ISO timestamp of the detection. */
  readonly recordedAt: string;
}

/** Clips to drop, oldest first, so that the rest plus `incomingBytes` fit in `maxBytes`. */
export function clipsToEvict(stored: readonly StoredClipSize[], incomingBytes: number, maxBytes: number): string[] {
  let total = stored.reduce((sum, clip) => sum + clip.bytes, 0) + incomingBytes;
  const evicted: string[] = [];
  for (const clip of [...stored].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))) {
    if (total <= maxBytes) break;
    evicted.push(clip.id);
    total -= clip.bytes;
  }
  return evicted;
}
