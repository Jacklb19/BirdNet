import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { extractTopDetections, parseLabelsFile } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';
import {
  INPUT_BATCH_SIZE, MIN_CANDIDATE_CONFIDENCE, TOP_K, WASM_NUM_THREADS, createSessionOptions,
} from './inference.constants';
import { persistDetections } from '../offline/queueStore';
import {
  INFERENCE_ERROR_REASONS, INFERENCE_WORKER_MESSAGES,
  type InferenceWorkerInbound, type InferenceWorkerOutbound, type LoadModelRequest, type InferRequest,
} from './inference.types';

/** The loaded model; replaced only after a complete, successful load so a failure never leaves half a model. */
interface LoadedModel {
  readonly session: ort.InferenceSession;
  readonly labels: readonly string[];
  readonly windowSamples: number;
}

let model: LoadedModel | null = null;

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
    model = { session, labels, windowSamples: message.windowSamples };
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
    const { session, labels, windowSamples } = model;
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
          timestamp: message.timestamp, latencyMs: performance.now() - startedAt,
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
      if (released) await released.session.release();
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
