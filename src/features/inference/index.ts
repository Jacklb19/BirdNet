/**
 * On-device ONNX bird sound classification (RF-05): public types and the inference service.
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
