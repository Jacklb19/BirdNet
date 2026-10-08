/**
 * Types of the ONNX inference pipeline (RF-05, ADR-01), including the messages exchanged between the
 * main thread and the inference worker.
 */
import type { PersistenceContext } from '../offline/types';

/** Lifecycle state of the model in the worker. */
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Model description read from its manifest (ADR-05); validated by `validateManifest`. */
export interface ModelManifest {
  readonly model_id: string;
  readonly variant: string;
  readonly sample_rate: number;
  readonly window_samples: number;
  readonly window_seconds: number;
  readonly num_classes: number;
  readonly sha256: string;
  readonly size_bytes: number;
  readonly labels_file: string;
  readonly model_file: string;
  readonly updated_at: string;
  /**
   * BirdNET's geographic model (ADR-18): species likely at a place and week, aligned 1:1 with the labels. Optional, so
   * an older manifest (or a deployment without it) still installs the acoustic model and simply filters nothing.
   */
  readonly geo_model_file?: string;
  readonly geo_sha256?: string;
  readonly geo_size_bytes?: number;
}

/** One ranked species candidate of a window. */
export interface Detection {
  /** Index in the model output vector (0..num_classes-1). */
  readonly classIndex: number;
  /** Full model label: scientific and common name joined by `MODEL_LABEL_SEPARATOR`. */
  readonly label: string;
  /** Scientific name (label part before the separator). */
  readonly scientificName: string;
  /** Common name (label part after the separator). */
  readonly commonName: string;
  /** Probability after the sigmoid, between 0 and 1 (RNF-09: confidence is always shown). */
  readonly confidence: number;
}

/** Wire names of the messages between the main thread and the inference worker. */
export const INFERENCE_WORKER_MESSAGES = Object.freeze({
  loadModel: 'LOAD_MODEL',
  infer: 'INFER',
  dispose: 'DISPOSE',
  disposed: 'DISPOSED',
  modelLoaded: 'MODEL_LOADED',
  modelError: 'MODEL_ERROR',
  inferenceResult: 'INFERENCE_RESULT',
  inferenceError: 'INFERENCE_ERROR',
} as const);

/** Why an inference failed, when the main thread must react differently from a classifier error. */
export const INFERENCE_ERROR_REASONS = Object.freeze({
  /** The window was classified but could not be stored, so its result was not published. */
  storage: 'storage',
} as const);

export type InferenceErrorReason = (typeof INFERENCE_ERROR_REASONS)[keyof typeof INFERENCE_ERROR_REASONS];

// ─── Messages to the worker ──────────────────────────────────────────────

export interface LoadModelRequest {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.loadModel;
  readonly modelUrl: string;
  readonly labelsUrl: string;
  /** Model input length in samples (`manifest.window_samples`); every INFER buffer must match it. */
  readonly windowSamples: number;
  /** Model file size in bytes (`manifest.size_bytes`, verified with its hash when the model is cached). */
  readonly modelSizeBytes: number;
  /** Geographic model, when the installation has one; without it no species is filtered by place and week. */
  readonly geoModelUrl?: string;
}

export interface InferRequest {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.infer;
  /** Normalized audio at the model sample rate, exactly `windowSamples` long. */
  readonly audioBuffer: Float32Array;
  /** Index of the source window. */
  readonly windowIndex: number;
  /** Capture time on the main thread's `performance.now()` clock. */
  readonly timestamp: number;
  /** Maximum candidates returned (default `TOP_K`). */
  readonly topK?: number;
  /** Minimum confidence of a returned candidate (default `MIN_CANDIDATE_CONFIDENCE`). */
  readonly minConfidence?: number;
  /** When present, the classified window is stored before the result is published. */
  readonly persistence?: PersistenceContext;
}

export interface DisposeRequest {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.dispose;
}
/** Sent once the worker has released its session; only then may the main thread terminate it. */
export interface DisposedMessage { readonly type: typeof INFERENCE_WORKER_MESSAGES.disposed }

export type InferenceWorkerInbound =
  | LoadModelRequest
  | InferRequest
  | DisposeRequest;

// ─── Messages from the worker ────────────────────────────────────────────

export interface ModelLoadedMessage {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.modelLoaded;
  readonly numClasses: number;
  readonly modelSizeBytes: number;
}

export interface ModelErrorMessage {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.modelError;
  readonly error: string;
}

export interface InferenceResultMessage {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.inferenceResult;
  readonly detections: readonly Detection[];
  readonly windowIndex: number;
  readonly timestamp: number;
  /** Inference latency in milliseconds. */
  readonly latencyMs: number;
  /** Species the geographic model considers likely for the place and week of this window; null when nothing was filtered. */
  readonly regionSpecies: number | null;
}

export interface InferenceErrorMessage {
  readonly type: typeof INFERENCE_WORKER_MESSAGES.inferenceError;
  readonly error: string;
  readonly windowIndex: number;
  readonly timestamp: number;
  readonly reason?: InferenceErrorReason;
}

export type InferenceWorkerOutbound =
  | ModelLoadedMessage
  | ModelErrorMessage
  | InferenceResultMessage
  | InferenceErrorMessage
  | DisposedMessage;
export type InferenceWorkerMessage = InferenceWorkerOutbound | DisposedMessage;
