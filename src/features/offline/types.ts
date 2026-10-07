import type { ModelManifest } from '../inference/inference.types';
import type { QueuedDetectionStatus } from './offline.constants';

export interface ApproximateLocation { latitude: number; longitude: number }
export interface StoredDetection {
  id: string;
  species: string;
  confidence: number;
  status: QueuedDetectionStatus;
  recorded_at: string;
  location: ApproximateLocation | null;
  model_version: string;
  owner: string | null;
  audioId: string | null;
  metadataSynced: boolean;
  bytes: number;
  /** Monitoring site chosen when the window was captured; absent on records from before sites existed. */
  siteId?: string | null;
}
/** Lightweight record kept after the server acknowledged a detection, so the log survives synchronization. */
export interface HistoryEntry {
  id: string;
  species: string;
  confidence: number;
  status: QueuedDetectionStatus;
  recorded_at: string;
  siteId: string | null;
  syncedAt: string;
}
export interface CachedSite { id: string; name: string; latitude: number; longitude: number }
export interface StoredAudio { id: string; blob: Blob; bytes: number }
export interface SyncSession { userId: string; accessToken: string; expiresAt: number }
export interface OfflineSettings {
  maxBytes: number;
  audioConsent: boolean;
  locationEnabled: boolean;
  session: SyncSession | null;
  activeSiteId?: string | null;
  /** Last site list fetched online, so a site can be chosen while offline. */
  sites?: CachedSite[];
  /** Account that fetched `sites`; absent on lists cached before it was recorded. */
  sitesOwner?: string | null;
}
export interface QueueStats { count: number; bytes: number; waitingLocation: number; waitingAccount: number }
export interface PersistenceContext {
  recordedAt: string;
  location: ApproximateLocation | null;
  modelVersion: string;
}
export interface ModelDownloadState {
  status: 'missing' | 'downloading' | 'cached' | 'error';
  received: number;
  total: number;
  manifest?: ModelManifest;
}
