import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { parseLabelsFile, rankDetections, windowScores } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';
import {
  INPUT_BATCH_SIZE, MIN_CANDIDATE_CONFIDENCE, POOLING_SCORE_FLOOR, TOP_K, WASM_NUM_THREADS, createSessionOptions,
} from './inference.constants';
import { averageScores, shareLabels } from './modelEnsemble';
import { poolWindows, type PoolingRule, type WindowScores } from './windowPooling';
import { resampleBandLimited } from '../audio/dsp/bandLimitedResample';
import { getSettings, persistDetections } from '../offline/queueStore';
import { recordingLocation } from '../offline/queuePolicy';
import { forgetSongs, keepSongClips } from '../recordings/songClips';
import { applyRegionMask, birdnetWeek, countLikely, GEO_INPUT_FEATURES, geoInput, regionMask } from './geoFilter';
import {
  INFERENCE_ERROR_REASONS, INFERENCE_WORKER_MESSAGES,
  type InferenceWorkerInbound, type InferenceWorkerOutbound, type LoadModelRequest, type InferRequest, type ModelSource,
} from './inference.types';

/** One acoustic model of the loaded set, with its own geographic model and the mask of the last place and week. */
interface Member {
  readonly session: ort.InferenceSession;
  readonly sampleRate: number;
  readonly windowSamples: number;
  readonly classes: number;
  /** Geographic model (ADR-18); null when the installation has none or it could not be loaded. */
  readonly geo: ort.InferenceSession | null;
  /** Recomputed only when the place or the week changes, so a session runs the geographic model a few times. */
  region: { readonly key: string; readonly mask: Uint8Array } | null;
}

/** What is loaded; replaced only after a complete, successful load so a failure never leaves half of it. */
interface LoadedModel {
  readonly members: readonly Member[];
  /** Labels shared by the members, and the place of each member's classes in them (`shareLabels`). */
  readonly labels: readonly string[];
  readonly positions: readonly Int32Array[];
  readonly capture: LoadModelRequest['capture'];
  readonly rule: PoolingRule;
}

let model: LoadedModel | null = null;

/**
 * Scores of the windows the decision rule still looks at, oldest first, and the index of the newest. Only windows
 * that follow one another are neighbours: after a gap (a new session, or a window dropped under back-pressure)
 * the next one decides alone.
 */
let recent: { readonly lastIndex: number; readonly windows: readonly WindowScores<number>[] } | null = null;

/** Confidence per class once this window is combined with its neighbours under the rule in use. */
function pooledScores(scores: WindowScores<number>, windowIndex: number, rule: PoolingRule): Map<number, number> {
  const earlier = recent && windowIndex === recent.lastIndex + 1 ? recent.windows : [];
  const windows = [...earlier, scores].slice(-rule.windows);
  recent = { lastIndex: windowIndex, windows };
  return poolWindows(windows, rule);
}

/**
 * Species likely where and when the window was recorded: the site or device cell from the stored settings (the same
 * rule that files the record, ADR-16) and the BirdNET week of the recording date. Null when the place is unknown or
 * the geographic model failed, in which case nothing is filtered rather than losing detections.
 */
async function regionFor(member: Member, persistence: InferRequest['persistence']): Promise<Uint8Array | null> {
  const { geo } = member;
  if (!geo) return null;
  try {
    const location = recordingLocation(await getSettings(), persistence?.location ?? null);
    if (!location) return null;
    const week = birdnetWeek(new Date(persistence?.recordedAt ?? Date.now()));
    const key = `${String(location.latitude)},${String(location.longitude)},${String(week)}`;
    if (member.region?.key === key) return member.region.mask;
    const inputName = geo.inputNames[0];
    const outputName = geo.outputNames[0];
    if (!inputName || !outputName) return null;
    const input = new ort.Tensor('float32', geoInput(location, week), [INPUT_BATCH_SIZE, GEO_INPUT_FEATURES]);
    try {
      const outputs = await geo.run({ [inputName]: input });
      const output = outputs[outputName];
      try {
        if (!output || !(output.data instanceof Float32Array) || output.data.length !== member.classes) return null;
        member.region = { key, mask: regionMask(output.data) };
        return member.region.mask;
      } finally { output?.dispose(); }
    } finally { input.dispose(); }
  } catch { return null; }
}

ort.env.wasm.numThreads = WASM_NUM_THREADS;
// Serve WASM from the same origin; the worker bundle is not the WASM resource directory.
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(wasmModuleUrl, self.location.href).href,
};

function postOutbound(message: InferenceWorkerOutbound): void {
  (self as unknown as { postMessage: (message: InferenceWorkerOutbound) => void }).postMessage(message);
}

/** A model file that comes in parts (a host that limits file size) is joined before the runtime reads it. */
async function joinParts(urls: readonly string[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('A part of the model could not be downloaded.');
    parts.push(new Uint8Array(await response.arrayBuffer()));
  }
  const whole = new Uint8Array(parts.reduce((bytes, part) => bytes + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    whole.set(part, offset);
    offset += part.length;
  }
  return whole;
}

async function loadMember(source: ModelSource): Promise<{ member: Member; labels: string[] }> {
  if (!Number.isSafeInteger(source.windowSamples) || source.windowSamples <= 0 || !Number.isSafeInteger(source.sampleRate) || source.sampleRate <= 0) {
    throw new Error('Invalid model window length.');
  }
  const response = await fetch(source.labelsUrl);
  if (!response.ok) throw new Error('Labels could not be downloaded.');
  const labels = parseLabelsFile(await response.text());
  if (labels.length === 0) throw new Error('Empty model labels.');
  const [file, ...rest] = source.modelUrls;
  if (!file) throw new Error('The model has no file.');
  const session = rest.length === 0
    ? await ort.InferenceSession.create(file, createSessionOptions())
    : await ort.InferenceSession.create(await joinParts(source.modelUrls), createSessionOptions());
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
    await session.release();
    throw new Error('Incompatible model inputs or outputs.');
  }
  // The filter is an improvement, not a requirement: listening goes on without it if the file cannot be loaded.
  const geo = source.geoModelUrl
    ? await ort.InferenceSession.create(source.geoModelUrl, createSessionOptions()).catch(() => null)
    : null;
  return { member: { session, sampleRate: source.sampleRate, windowSamples: source.windowSamples, classes: labels.length, geo, region: null }, labels };
}

async function release(members: readonly Member[]): Promise<void> {
  for (const member of members) {
    await member.session.release();
    await member.geo?.release();
  }
}

async function loadModel(message: LoadModelRequest): Promise<void> {
  const members: Member[] = [];
  try {
    const { capture } = message;
    if (message.models.length === 0 || !Number.isSafeInteger(capture.windowSamples) || capture.windowSamples <= 0 || !(capture.sampleRate > 0)) {
      throw new Error('Invalid model window length.');
    }
    const labelLists: string[][] = [];
    for (const source of message.models) {
      const loaded = await loadMember(source);
      members.push(loaded.member);
      labelLists.push(loaded.labels);
    }
    const { labels, positions } = shareLabels(labelLists);
    recent = null;
    model = { members, labels, positions, capture, rule: message.decisionRule };
    postOutbound({ type: INFERENCE_WORKER_MESSAGES.modelLoaded, numClasses: labels.length, modelSizeBytes: message.modelSizeBytes });
  } catch (error) {
    await release(members).catch(() => undefined);
    postOutbound({ type: INFERENCE_WORKER_MESSAGES.modelError, error: error instanceof Error ? error.message : String(error) });
  }
}

interface Heard {
  /** Confidence of each class of the model, by class index. */
  readonly scores: Map<number, number>;
  /** Mask of the species likely there and then, when the model filtered by it. */
  readonly mask: Uint8Array | null;
}

/** What one model hears in the window. */
async function listen(member: Member, window: Float32Array, capture: LoadedModel['capture'], persistence: InferRequest['persistence']): Promise<Heard> {
  const audio = member.sampleRate === capture.sampleRate ? window : resampleBandLimited(window, capture.sampleRate, member.sampleRate);
  if (audio.length !== member.windowSamples) throw new Error('The window does not fit the model.');
  const inputName = member.session.inputNames[0];
  const outputName = member.session.outputNames[0];
  if (!inputName || !outputName) throw new Error('Missing model tensor names.');
  const input = new ort.Tensor('float32', audio, [INPUT_BATCH_SIZE, member.windowSamples]);
  try {
    const outputs = await member.session.run({ [inputName]: input });
    const output = outputs[outputName];
    if (!output || !(output.data instanceof Float32Array)) throw new Error('Invalid classifier tensor.');
    try {
      if (output.data.length !== member.classes) throw new Error('Classifier output does not match the labels.');
      const mask = await regionFor(member, persistence);
      if (mask) applyRegionMask(output.data, mask);
      return { scores: windowScores(output.data, POOLING_SCORE_FLOOR), mask };
    } finally {
      output.dispose();
    }
  } finally {
    input.dispose();
  }
}

async function infer(message: InferRequest): Promise<void> {
  let persistenceStarted = false;
  try {
    const startedAt = performance.now();
    if (!model) throw new Error('Model is not loaded.');
    const { members, labels, positions, capture, rule } = model;
    if (message.audioBuffer.length !== capture.windowSamples || message.audioBuffer.some((value) => !Number.isFinite(value))) {
      throw new Error(`Expected ${String(capture.windowSamples)} finite audio samples.`);
    }
    const heard: Heard[] = [];
    for (const member of members) heard.push(await listen(member, message.audioBuffer, capture, message.persistence));
    const detections = rankDetections(
      pooledScores(averageScores(heard.map((result) => result.scores), positions, POOLING_SCORE_FLOOR), message.windowIndex, rule),
      message.topK ?? TOP_K, message.minConfidence ?? MIN_CANDIDATE_CONFIDENCE, labels,
    );
    if (message.persistence) {
      persistenceStarted = true;
      const stored = await persistDetections(applyDetectionPolicy(detections), message.audioBuffer, message.persistence);
      persistenceStarted = false;
      // Not awaited: the clip is an extra, and neither its encoding nor a failure may hold back the result.
      keepSongClips(stored, message.audioBuffer);
    }
    // The count shown is that of the first model that filtered: with two, their lists differ by a few species.
    const mask = heard.find((result) => result.mask)?.mask ?? null;
    postOutbound({
      type: INFERENCE_WORKER_MESSAGES.inferenceResult, detections, windowIndex: message.windowIndex,
      timestamp: message.timestamp, latencyMs: performance.now() - startedAt, regionSpecies: mask ? countLikely(mask) : null,
    });
  } catch (error) {
    postOutbound({
      type: INFERENCE_WORKER_MESSAGES.inferenceError, error: error instanceof Error ? error.message : String(error),
      windowIndex: message.windowIndex, timestamp: message.timestamp,
      ...(persistenceStarted ? { reason: INFERENCE_ERROR_REASONS.storage } : {}),
    });
  }
}

/** Worker protocol entry point; the service permits only one active inference. */
export async function handleWorkerRequest(message: InferenceWorkerInbound): Promise<void> {
  switch (message.type) {
    case INFERENCE_WORKER_MESSAGES.loadModel: await loadModel(message); break;
    case INFERENCE_WORKER_MESSAGES.infer: await infer(message); break;
    case INFERENCE_WORKER_MESSAGES.dispose: {
      const released = model;
      model = null;
      recent = null;
      forgetSongs();
      if (released) await release(released.members);
      break;
    }
  }
}

let requests = Promise.resolve();
self.onmessage = (event: MessageEvent<InferenceWorkerInbound>): void => {
  requests = requests.then(async () => {
    try { await handleWorkerRequest(event.data); }
    catch (error) { postOutbound({ type: INFERENCE_WORKER_MESSAGES.modelError, error: error instanceof Error ? error.message : String(error) }); }
    finally {
      if (event.data.type === INFERENCE_WORKER_MESSAGES.dispose) postOutbound({ type: INFERENCE_WORKER_MESSAGES.disposed });
    }
  });
};
