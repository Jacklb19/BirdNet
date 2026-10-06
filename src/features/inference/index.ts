/**
 * Feature de inferencia ONNX para clasificación acústica de aves (RF-05).
 * Reexporta tipos y servicio principal.
 */

export type {
  ModelStatus,
  ModelManifest,
  Detection,
  InferenceWorkerInbound,
  InferenceWorkerOutbound,
  InferenceResultMessage,
  LoadModelRequest,
  InferRequest,
} from './inference.types';

export { InferenceService, type InferenceCallbacks } from './inference.service';
