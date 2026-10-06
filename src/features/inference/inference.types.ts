/**
 * Tipos compartidos para el pipeline de inferencia ONNX (RF-05, ADR-01).
 * Define los mensajes entre el hilo principal y el Worker de inferencia.
 */
import type { PersistenceContext } from '../offline/types';

/** Estado del ciclo de vida del modelo en el Worker */
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Información del modelo cargado, leída de manifest.json (ADR-05) */
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
}

/** Una detección individual con su especie, confianza y posición en el ranking */
export interface Detection {
  /** Índice en el vector de salida del modelo (0..num_classes-1) */
  readonly classIndex: number;
  /** Etiqueta completa del modelo: "Genus species_Common Name" */
  readonly label: string;
  /** Nombre científico (primera parte de la etiqueta) */
  readonly scientificName: string;
  /** Nombre común (segunda parte de la etiqueta, después del guion bajo) */
  readonly commonName: string;
  /** Probabilidad tras sigmoide, entre 0 y 1 (RNF-09: siempre mostrar confianza) */
  readonly confidence: number;
}

// ─── Mensajes entrantes al Worker ────────────────────────────────────────

export interface LoadModelRequest {
  readonly type: 'LOAD_MODEL';
  readonly modelUrl: string;
  readonly labelsUrl: string;
}

export interface InferRequest {
  readonly type: 'INFER';
  /** Audio crudo normalizado a 48 kHz, 144.000 muestras */
  readonly audioBuffer: Float32Array;
  /** Índice de la ventana de origen */
  readonly windowIndex: number;
  /** Timestamp de captura */
  readonly timestamp: number;
  /** Número máximo de detecciones a devolver (por defecto 5) */
  readonly topK?: number;
  /** Umbral mínimo de confianza para incluir una detección (por defecto 0.1) */
  readonly minConfidence?: number;
  readonly persistence?: PersistenceContext;
}

export interface DisposeRequest {
  readonly type: 'DISPOSE';
}
export interface DisposedMessage { readonly type: 'DISPOSED' }

export type InferenceWorkerInbound =
  | LoadModelRequest
  | InferRequest
  | DisposeRequest;

// ─── Mensajes salientes del Worker ───────────────────────────────────────

export interface ModelLoadedMessage {
  readonly type: 'MODEL_LOADED';
  readonly numClasses: number;
  readonly modelSizeBytes: number;
}

export interface ModelErrorMessage {
  readonly type: 'MODEL_ERROR';
  readonly error: string;
}

export interface InferenceResultMessage {
  readonly type: 'INFERENCE_RESULT';
  readonly detections: readonly Detection[];
  readonly windowIndex: number;
  readonly timestamp: number;
  /** Latencia de la inferencia en milisegundos */
  readonly latencyMs: number;
}

export interface InferenceErrorMessage {
  readonly type: 'INFERENCE_ERROR';
  readonly error: string;
  readonly windowIndex: number;
  readonly timestamp: number;
  readonly reason?: 'storage';
}

export type InferenceWorkerOutbound =
  | ModelLoadedMessage
  | ModelErrorMessage
  | InferenceResultMessage
  | InferenceErrorMessage
  | DisposedMessage;
export type InferenceWorkerMessage = InferenceWorkerOutbound | DisposedMessage;
