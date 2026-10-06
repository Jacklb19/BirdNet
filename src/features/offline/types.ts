import type { ModelManifest } from '../inference/inference.types';

export interface ApproximateLocation { latitude: number; longitude: number }
export interface StoredDetection {
  id: string;
  species: string;
  confidence: number;
  status: 'confirmed' | 'provisional';
  recorded_at: string;
  location: ApproximateLocation | null;
  model_version: string;
  owner: string | null;
  audioId: string | null;
  metadataSynced: boolean;
  bytes: number;
}
export interface StoredAudio { id: string; blob: Blob; bytes: number }
export interface SyncSession { userId: string; accessToken: string; expiresAt: number }
export interface OfflineSettings {
  maxBytes: number;
  audioConsent: boolean;
  locationEnabled: boolean;
  session: SyncSession | null;
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
export const DEFAULT_QUEUE_BYTES = 64 * 1024 * 1024;
export const DATABASE_NAME = 'birdnet-offline-v1';
export const SYNC_TAG = 'birdnet-detections';
