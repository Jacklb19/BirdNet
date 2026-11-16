import { AudioSampleSink, BlobSource, FLAC, Input, MP3, MP4, OGG, WAVE, WEBM } from 'mediabunny';
import { registerAccountActivity } from '../account/sessionActivity';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { AudioWindowAccumulator } from '../audio/worklet/audio-window-processor';
import { InferenceService } from '../inference/inference.service';
import { applyDetectionPolicy } from '../inference/detectionPolicy';
import type { Detection } from '../inference/inference.types';
import { mergeSession, type SessionSpecies } from '../listen/session';
import { changeEntry, entityKey, saveEntity } from '../journal/journalStore';
import { getSettings } from '../offline/queueStore';
import { scheduleSynchronization } from '../offline/offlineClient';
import type { ApproximateLocation, PersistenceContext } from '../offline/types';
import { importIsActive, setImportActive } from './importActivity';
import { IMPORT_CHUNK_FRAMES, IMPORT_MAX_CHANNELS, IMPORT_MAX_SAMPLE_RATE } from './import.config';
import { ImportError } from './errors';

export interface ImportOptions {
  owner: string; save: boolean; recordedAt: string | null; location: ApproximateLocation | null; title: string | null;
}
export interface ImportProgress { windows: number; seconds: number; duration: number | null; species: readonly SessionSpecies[]; outingId: string | null }
export interface ImportResult extends ImportProgress { cancelled: boolean }

/** Decodes a local container incrementally, with one model window in flight and no upload of the original. */
export async function importRecording(file: File, options: ImportOptions, progress: (value: ImportProgress) => void, controller: AbortController): Promise<ImportResult> {
  if (importIsActive()) throw new ImportError('busy');
  if (options.save && (!options.recordedAt || !Number.isFinite(Date.parse(options.recordedAt)))) throw new ImportError('metadata');
  if (!file.size) throw new ImportError('unsupported');
  const { signal } = controller;
  const cancelled = (): boolean => signal.aborted;
  setImportActive(true);
  let release: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => { release = resolve; });
  const unregister = registerAccountActivity(async () => { controller.abort(); await finished; });
  // The explicit format list excludes playlists and remote subresources.
  const input = new Input({ formats: [WAVE, MP3, MP4, OGG, FLAC, WEBM], source: new BlobSource(file) });
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((reason: unknown) => void) | null = null;
  let resolveWindow: ((value: readonly Detection[]) => void) | null = null;
  let rejectWindow: ((reason: unknown) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Loading starts after the container is validated; keep a rejection handled if cancellation comes earlier.
  void ready.catch(() => undefined);
  const service = new InferenceService({
    onModelLoaded: () => { resolveReady?.(); },
    onInferenceResult: (detections) => { const resolve = resolveWindow; resolveWindow = null; rejectWindow = null; resolve?.(detections); },
    onError: () => { const error = new ImportError('model'); rejectReady?.(error); rejectWindow?.(error); },
    onStorageError: () => { rejectWindow?.(new ImportError('storage')); },
    onWindowDropped: () => { rejectWindow?.(new ImportError('model')); },
  });
  let released: Promise<void> | null = null;
  const releaseModel = (): Promise<void> => { released ??= service.disposeAndWait(); return released; };
  const stop = (): void => { const error = new DOMException('Cancelled', 'AbortError'); rejectReady?.(error); rejectWindow?.(error); input.dispose(); void releaseModel(); };
  signal.addEventListener('abort', stop, { once: true });
  let value: ImportProgress = { windows: 0, seconds: 0, duration: null, species: [], outingId: null };
  let state: 'cancelled' | 'completed' | 'failed' = 'failed';
  try {
    if (cancelled()) throw new DOMException('Cancelled', 'AbortError');
    if (!await input.canRead()) throw new ImportError('unsupported');
    const track = await input.getPrimaryAudioTrack();
    if (!track || !await track.canDecode()) throw new ImportError('unsupported');
    const rate = await track.getSampleRate(); const channels = await track.getNumberOfChannels();
    if (!Number.isFinite(rate) || rate <= 0 || rate > IMPORT_MAX_SAMPLE_RATE || !Number.isSafeInteger(channels) || channels < 1 || channels > IMPORT_MAX_CHANNELS) throw new ImportError('unsupported');
    const firstTimestamp = await track.getFirstTimestamp();
    if (!Number.isFinite(firstTimestamp)) throw new ImportError('unsupported');
    const duration = await input.getDurationFromMetadata([track]);
    value = { ...value, duration: duration !== null && Number.isFinite(duration) && duration > firstTimestamp ? duration - firstTimestamp : null };
    if (value.duration !== null && value.duration < AUDIO_CONSTANTS.WINDOW_DURATION_SEC) throw new ImportError('short');
    if ((await getSettings()).session?.userId !== options.owner) throw new ImportError('account');
    if (options.save && options.recordedAt) {
      const id = await saveEntity(options.owner, 'outing', { title: options.title, kind: 'import', started_at: options.recordedAt, ended_at: null, note: null, site_id: null, walk_id: null });
      value = { ...value, outingId: id };
      await changeEntry(entityKey(options.owner, 'outing', id), (row) => row?.tag === 'entity' ? { ...row, importState: 'running' } : row);
    }
    progress(value);
    await service.loadModel(); await ready;
    if (cancelled()) throw new DOMException('Cancelled', 'AbortError');
    let accumulator = new AudioWindowAccumulator(rate);
    let index = 0; let previousEnd: number | null = null;
    const sink = new AudioSampleSink(track);
    for await (const sample of sink.samples()) {
      try {
        if (cancelled()) break;
        if (sample.sampleRate !== rate || sample.numberOfChannels !== channels) throw new ImportError('unsupported');
        if (previousEnd !== null && Math.abs(sample.timestamp - previousEnd) > 2 / rate) { accumulator = new AudioWindowAccumulator(rate); index++; }
        previousEnd = sample.timestamp + sample.duration;
        for (let offset = 0; offset < sample.numberOfFrames; offset += IMPORT_CHUNK_FRAMES) {
          if (cancelled()) break;
          const frames = Math.min(IMPORT_CHUNK_FRAMES, sample.numberOfFrames - offset);
          const mono = new Float32Array(frames); const plane = new Float32Array(frames);
          for (let channel = 0; channel < channels; channel++) {
            sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar', frameOffset: offset, frameCount: frames });
            for (let frame = 0; frame < frames; frame++) mono[frame] = (mono[frame] ?? 0) + (plane[frame] ?? 0) / channels;
          }
          if (mono.some((amplitude) => !Number.isFinite(amplitude))) throw new ImportError('unsupported');
          const window = accumulator.processChunk(mono);
          if (!window) continue;
          const seconds = Math.max(0, sample.timestamp - firstTimestamp + (offset + frames) / rate);
          value = { ...value, seconds };
          if ((await getSettings()).session?.userId !== options.owner) throw new ImportError('account');
          const modelVersion = service.getModelVersion();
          if (!modelVersion) throw new ImportError('model');
          const context: PersistenceContext = { recordedAt: options.recordedAt ? new Date(Date.parse(options.recordedAt) + seconds * 1000).toISOString() : null,
            location: options.location, owner: options.owner, modelVersion, historical: true, store: options.save, outingId: value.outingId };
          const detections = await new Promise<readonly Detection[]>((resolve, reject) => {
            resolveWindow = resolve; rejectWindow = reject;
            service.infer(window.window, index++, performance.now(), undefined, undefined, context);
          });
          value = { ...value, windows: value.windows + 1, species: mergeSession(value.species, applyDetectionPolicy(detections), seconds * 1000) };
          progress(value);
        }
      } finally { sample.close(); }
      if (cancelled()) break;
    }
    if (!cancelled() && value.windows === 0) throw new ImportError('short');
    state = cancelled() ? 'cancelled' : 'completed';
    return { ...value, cancelled: cancelled() };
  } catch (error) {
    if (cancelled()) { state = 'cancelled'; return { ...value, cancelled: true }; }
    throw error instanceof ImportError ? error : new ImportError('unsupported');
  } finally {
    signal.removeEventListener('abort', stop);
    input.dispose();
    await releaseModel();
    try {
      if (value.outingId && (await getSettings()).session?.userId === options.owner) {
        const ended = options.recordedAt ? new Date(Date.parse(options.recordedAt) + value.seconds * 1000).toISOString() : null;
        await changeEntry(entityKey(options.owner, 'outing', value.outingId), (row) => row?.tag === 'entity' && row.kind === 'outing' ? { ...row, data: { ...row.data, ended_at: ended }, importState: state, dirty: true, revision: row.revision + 1 } : row);
        void scheduleSynchronization().catch(() => undefined);
      }
    } finally { setImportActive(false); unregister(); release(); }
  }
}
