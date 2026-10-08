/**
 * Settings of the on-device classifier: ranking of the model output and ONNX Runtime Web tuning.
 * Detection thresholds themselves live in `config/contract.ts`, shared with the API.
 */
import type { InferenceSession } from 'onnxruntime-web/wasm';
import { CONFIDENCE_THRESHOLDS } from '../../config/contract';

/** Species candidates kept per window, in decreasing confidence. */
export const TOP_K = 5;

/**
 * Candidates below the discard threshold are never shown nor stored (Table 7), so they are dropped
 * while ranking instead of travelling to the main thread.
 */
export const MIN_CANDIDATE_CONFIDENCE = CONFIDENCE_THRESHOLDS.discardBelow;

/**
 * ONNX Runtime WASM threads. One window takes tens of milliseconds on CPU (decisiones.md), far less than
 * the hop between windows, and inference already runs in its own worker; more threads would only add
 * workers and memory, and need SharedArrayBuffer, which exists only on cross-origin isolated pages.
 */
export const WASM_NUM_THREADS = 1;

/**
 * Session options: the portable WASM backend, with every graph optimization applied once at load.
 * A factory instead of a shared constant because ONNX Runtime writes into the object it receives (it adds
 * its own `extra` settings): a frozen or reused object makes `InferenceSession.create` throw.
 */
export function createSessionOptions(): InferenceSession.SessionOptions {
  return { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
}

/** The model takes one window per run: back-pressure keeps a single window in flight. */
export const INPUT_BATCH_SIZE = 1;

/** Separator between scientific and common name in each line of the model labels file. */
export const MODEL_LABEL_SEPARATOR = '_';

/** Line separator of the model labels file (one label per line). */
export const MODEL_LABELS_LINE_SEPARATOR = '\n';
