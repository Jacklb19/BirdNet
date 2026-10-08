import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { extractTopDetections, parseLabelsFile } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';
import {
  INPUT_BATCH_SIZE, MIN_CANDIDATE_CONFIDENCE, TOP_K, WASM_NUM_THREADS, createSessionOptions,
} from './inference.constants';
import { getSettings, persistDetections } from '../offline/queueStore';
import { recordingLocation } from '../offline/queuePolicy';
import { applyRegionMask, birdnetWeek, countLikely, GEO_INPUT_FEATURES, geoInput, regionMask } from './geoFilter';
import {
  INFERENCE_ERROR_REASONS, INFERENCE_WORKER_MESSAGES,
  type InferenceWorkerInbound, type InferenceWorkerOutbound, type LoadModelRequest, type InferRequest,
} from './inference.types';

/** The loaded model; replaced only after a complete, successful load so a failure never leaves half a model. */
interface LoadedModel {
  readonly session: ort.InferenceSession;
  readonly labels: readonly string[];
  readonly windowSamples: number;
  /** Geographic model (ADR-18); null when the installation has none or it could not be loaded. */
  readonly geo: ort.InferenceSession | null;
}

let model: LoadedModel | null = null;

/** Mask of the last place and week; recomputed only when either changes, so a session runs the geo model a few times. */
let region: { readonly key: string; readonly mask: Uint8Array } | null = null;

/**
 * Species likely where and when the window was recorded: the site or device cell from the stored settings (the same
 * rule that files the record, ADR-16) and the BirdNET week of the recording date. Null when the place is unknown or
 * the geographic model failed, in which case nothing is filtered rather than losing detections.
 */
async function regionFor(geo: ort.InferenceSession, labels: number, persistence: InferRequest['persistence']): Promise<Uint8Array | null> {
  try {
    const location = recordingLocation(await getSettings(), persistence?.location ?? null);
    if (!location) return null;
    const week = birdnetWeek(new Date(persistence?.recordedAt ?? Date.now()));
    const key = `${String(location.latitude)},${String(location.longitude)},${String(week)}`;
    if (region?.key === key) return region.mask;
    const inputName = geo.inputNames[0];
    const outputName = geo.outputNames[0];
    if (!inputName || !outputName) return null;
    const input = new ort.Tensor('float32', geoInput(location, week), [INPUT_BATCH_SIZE, GEO_INPUT_FEATURES]);
    try {
      const outputs = await geo.run({ [inputName]: input });
      const output = outputs[outputName];
      try {
        if (!output || !(output.data instanceof Float32Array) || output.data.length !== labels) return null;
        region = { key, mask: regionMask(output.data) };
        return region.mask;
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

async function loadModel(message: LoadModelRequest): Promise<void> {
  try {
    if (!Number.isSafeInteger(message.windowSamples) || message.windowSamples <= 0) {
      throw new Error('Invalid model window length.');
    }
    const response = await fetch(message.labelsUrl);
    if (!response.ok) throw new Error('Labels could not be downloaded.');
    const labels = parseLabelsFile(await response.text());
    if (labels.length === 0) throw new Error('Empty model labels.');
    const session = await ort.InferenceSession.create(message.modelUrl, createSessionOptions());
    if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
      throw new Error('Incompatible model inputs or outputs.');
    }
    // The filter is an improvement, not a requirement: listening goes on without it if the file cannot be loaded.
    const geo = message.geoModelUrl
      ? await ort.InferenceSession.create(message.geoModelUrl, createSessionOptions()).catch(() => null)
      : null;
    region = null;
    model = { session, labels, windowSamples: message.windowSamples, geo };
    postOutbound({ type: INFERENCE_WORKER_MESSAGES.modelLoaded, numClasses: labels.length, modelSizeBytes: message.modelSizeBytes });
  } catch (error) {
    postOutbound({ type: INFERENCE_WORKER_MESSAGES.modelError, error: error instanceof Error ? error.message : String(error) });
  }
}

async function infer(message: InferRequest): Promise<void> {
  let persistenceStarted = false;
  try {
    const startedAt = performance.now();
    if (!model) throw new Error('Model is not loaded.');
    const { session, labels, windowSamples, geo } = model;
    if (message.audioBuffer.length !== windowSamples || message.audioBuffer.some((value) => !Number.isFinite(value))) {
      throw new Error(`Expected ${String(windowSamples)} finite audio samples.`);
    }
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) throw new Error('Missing model tensor names.');
    const input = new ort.Tensor('float32', message.audioBuffer, [INPUT_BATCH_SIZE, windowSamples]);
    try {
      const outputs = await session.run({ [inputName]: input });
      const output = outputs[outputName];
      if (!output || !(output.data instanceof Float32Array)) throw new Error('Invalid classifier tensor.');
      try {
        const mask = geo ? await regionFor(geo, labels.length, message.persistence) : null;
        if (mask) applyRegionMask(output.data, mask);
        const detections = extractTopDetections(
          output.data, message.topK ?? TOP_K, message.minConfidence ?? MIN_CANDIDATE_CONFIDENCE, labels,
        );
        if (message.persistence) {
          persistenceStarted = true;
          await persistDetections(applyDetectionPolicy(detections), message.audioBuffer, message.persistence);
          persistenceStarted = false;
        }
        postOutbound({
          type: INFERENCE_WORKER_MESSAGES.inferenceResult, detections, windowIndex: message.windowIndex,
          timestamp: message.timestamp, latencyMs: performance.now() - startedAt, regionSpecies: mask ? countLikely(mask) : null,
        });
      } finally {
        output.dispose();
      }
    } finally {
      input.dispose();
    }
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
      region = null;
      if (released) {
        await released.session.release();
        await released.geo?.release();
      }
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
