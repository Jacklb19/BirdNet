import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import type { Detection } from './inference.types';

/** Local verification states, in increasing confidence. */
export const LOCAL_DETECTION_STATUSES = Object.freeze(['provisional', 'confirmed_local'] as const);
export type LocalDetectionStatus = (typeof LOCAL_DETECTION_STATUSES)[number];

export interface ClassifiedDetection extends Detection {
  readonly status: LocalDetectionStatus;
}

/**
 * Table 7 for one confidence: null below `discardBelow` (the detection is not kept), confirmed locally
 * from `confirmedFrom`, provisional in between.
 */
export function classifyConfidence(confidence: number): LocalDetectionStatus | null {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Invalid detection confidence.');
  }
  if (confidence < CONFIDENCE_THRESHOLDS.discardBelow) return null;
  return confidence >= CONFIDENCE_THRESHOLDS.confirmedFrom ? 'confirmed_local' : 'provisional';
}

/** Applies Table 7 to the candidates of a window, dropping discarded ones; candidates are not mutated. */
export function applyDetectionPolicy(detections: readonly Detection[]): ClassifiedDetection[] {
  return detections.flatMap((detection) => {
    const status = classifyConfidence(detection.confidence);
    return status === null ? [] : [{ ...detection, status }];
  });
}
