import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { extractTopDetections } from './inferenceResults';
import { applyDetectionPolicy } from './detectionPolicy';
import { persistDetections } from '../offline/queueStore';
import type { InferenceWorkerInbound, InferenceWorkerOutbound, LoadModelRequest, InferRequest } from './inference.types';

let session: ort.InferenceSession | null = null;
let labels: string[] = [];

// Serve WASM from the same origin; the worker bundle is not the WASM resource directory.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(wasmModuleUrl, self.location.href).href,
};

function postOutbound(message: InferenceWorkerOutbound): void {
  (self as unknown as { postMessage: (message: InferenceWorkerOutbound) => void }).postMessage(message);
}

async function loadModel(message: LoadModelRequest): Promise<void> {
  try {
    const response = await fetch(message.labelsUrl);
    if (!response.ok) throw new Error('Labels could not be downloaded.');
    labels = (await response.text()).split('\n').map((label) => label.trim()).filter(Boolean);
    if (labels.length === 0) throw new Error('Empty model labels.');
    session = await ort.InferenceSession.create(message.modelUrl, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    });
    if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
      throw new Error('Incompatible model inputs or outputs.');
    }
    postOutbound({ type: 'MODEL_LOADED', numClasses: labels.length, modelSizeBytes: 0 });
  } catch (error) {
    postOutbound({ type: 'MODEL_ERROR', error: error instanceof Error ? error.message : String(error) });
  }
}

async function infer(message: InferRequest): Promise<void> {
  let persistenceStarted = false;
  try {
    const startedAt = performance.now();
    if (!session) throw new Error('Model is not loaded.');
    if (message.audioBuffer.length !== 144000 || message.audioBuffer.some((value) => !Number.isFinite(value))) {
      throw new Error('Expected 144000 finite audio samples.');
    }
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) throw new Error('Missing model tensor names.');
    const input = new ort.Tensor('float32', message.audioBuffer, [1, 144000]);
    try {
      const outputs = await session.run({ [inputName]: input });
      const output = outputs[outputName];
      if (!output || !(output.data instanceof Float32Array)) throw new Error('Invalid classifier tensor.');
      try {
        const detections = extractTopDetections(output.data, message.topK ?? 5, message.minConfidence ?? 0.1, labels);
        if (message.persistence) {
          persistenceStarted = true;
          await persistDetections(applyDetectionPolicy(detections), message.audioBuffer, message.persistence);
          persistenceStarted = false;
        }
        postOutbound({
          type: 'INFERENCE_RESULT', detections, windowIndex: message.windowIndex,
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
      type: 'INFERENCE_ERROR', error: error instanceof Error ? error.message : String(error),
      windowIndex: message.windowIndex, timestamp: message.timestamp,
      ...(persistenceStarted ? { reason: 'storage' as const } : {}),
    });
  }
}

/** Worker protocol entry point; the service permits only one active inference. */
export async function handleWorkerRequest(message: InferenceWorkerInbound): Promise<void> {
  switch (message.type) {
    case 'LOAD_MODEL': await loadModel(message); break;
    case 'INFER': await infer(message); break;
    case 'DISPOSE':
      if (session) await session.release();
      session = null;
      labels = [];
      break;
  }
}

let requests = Promise.resolve();
self.onmessage = (event: MessageEvent<InferenceWorkerInbound>): void => {
  requests = requests.then(async () => {
    try { await handleWorkerRequest(event.data); }
    catch (error) { postOutbound({ type: 'MODEL_ERROR', error: error instanceof Error ? error.message : String(error) }); }
    finally { if (event.data.type === 'DISPOSE') self.postMessage({ type: 'DISPOSED' }); }
  });
};
