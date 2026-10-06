import type { Detection } from './inference.types';

export type LocalDetectionStatus = 'confirmed_local' | 'provisional';
export interface ClassifiedDetection extends Detection {
  readonly status: LocalDetectionStatus;
}

/** Table 7: discard below 0.45; 0.80 belongs to the locally confirmed range. */
export function applyDetectionPolicy(detections: readonly Detection[]): ClassifiedDetection[] {
  return detections.flatMap((detection) => {
    if (!Number.isFinite(detection.confidence) || detection.confidence < 0 || detection.confidence > 1) {
      throw new Error('Invalid detection confidence.');
    }
    if (detection.confidence < 0.45) return [];
    return [{ ...detection, status: detection.confidence >= 0.80 ? 'confirmed_local' : 'provisional' }];
  });
}
