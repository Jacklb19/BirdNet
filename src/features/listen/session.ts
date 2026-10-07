import { LOCAL_DETECTION_STATUSES, type ClassifiedDetection, type LocalDetectionStatus } from '../inference/detectionPolicy';

export interface SessionSpecies {
  scientificName: string;
  /** English label from the model, used only when no localized name exists. */
  label: string;
  confidence: number;
  status: LocalDetectionStatus;
  windows: number;
  lastHeard: number;
  singingNow: boolean;
}

/** The stronger of two local states; `LOCAL_DETECTION_STATUSES` lists them in increasing confidence. */
function strongerStatus(first: LocalDetectionStatus, second: LocalDetectionStatus): LocalDetectionStatus {
  return LOCAL_DETECTION_STATUSES.indexOf(first) >= LOCAL_DETECTION_STATUSES.indexOf(second) ? first : second;
}

/** Folds the latest analysed window into the session list: best confidence wins, the current singers go first. */
export function mergeSession(previous: readonly SessionSpecies[], latest: readonly ClassifiedDetection[], at: number): SessionSpecies[] {
  const byName = new Map(previous.map((row) => [row.scientificName, { ...row, singingNow: false }]));
  for (const detection of latest) {
    const current = byName.get(detection.scientificName);
    byName.set(detection.scientificName, {
      scientificName: detection.scientificName, label: detection.commonName,
      confidence: Math.max(current?.confidence ?? 0, detection.confidence),
      // The best window of the session decides, so a species confirmed once stays confirmed. Each window was
      // already classified by the detection policy, which stays the only place that applies the thresholds.
      status: current ? strongerStatus(current.status, detection.status) : detection.status,
      windows: (current?.windows ?? 0) + 1, lastHeard: at, singingNow: true,
    });
  }
  return [...byName.values()].sort((a, b) => Number(b.singingNow) - Number(a.singingNow) || b.lastHeard - a.lastHeard || b.confidence - a.confidence);
}
