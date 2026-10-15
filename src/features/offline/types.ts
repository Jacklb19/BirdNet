import type { DetectionModel, DetectionStyle } from '../inference/detectionChoices';
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
  /** Cell the song was filed under, kept so the person's own map works without the server; absent on entries from before S8. */
  location?: ApproximateLocation | null;
}
/**
 * Cell of a walk's path as [latitude, longitude], with the whole seconds since the walk started on walks recorded
 * since S10; only rounded cells are ever stored (ADR-22).
 */
export type TrackPoint = readonly [number, number] | readonly [number, number, number];
/** Where a walk stands with the account (ADR-35); absent means it has not been sent yet. */
export type WalkAccountState =
  /** Waiting to be sent: new, renamed, or waiting for the permission, a session or a connection. */
  | 'pending'
  /** The account holds this version of it. */
  | 'saved'
  /** It stays on the phone only: the person removed it from the account, or the server will never take it. */
  | 'phoneOnly';
/**
 * A walk: the path covered while listening. It stays on this phone unless the person chose to save walks in their
 * account (ADR-35); its songs are synchronized as ordinary detections either way.
 */
export interface StoredWalk {
  id: string;
  startedAt: string;
  /** Null while the walk is under way (or was interrupted before it could be closed). */
  endedAt: string | null;
  track: TrackPoint[];
  /** Last moment the walk was known to go on, refreshed while it lasts; closes an interrupted walk. Absent before S10. */
  lastAt?: string;
  /** The person's name for it; absent or null shows one built from its date. */
  name?: string | null;
  /** Account signed in when it started: null without one, absent on walks from before S10. */
  owner?: string | null;
  account?: WalkAccountState;
  /** The account holds a copy, perhaps an older one (renamed since): deleting the walk must delete it there too. */
  inAccount?: boolean;
}
export interface CachedSite { id: string; name: string; latitude: number; longitude: number }
export interface SyncSession { userId: string; accessToken: string; expiresAt: number }
export interface OfflineSettings {
  maxBytes: number;
  locationEnabled: boolean;
  session: SyncSession | null;
  activeSiteId?: string | null;
  /** The person's answer to "share my songs on everyone's map"; absent until they have answered. */
  shareMap?: boolean;
  /** Whether each song keeps its clip on this phone; absent means yes, since that audio stays here. */
  keepRecordings?: boolean;
  /** The person's answer to "also save my recordings in my account"; nothing is uploaded until it is yes. */
  saveRecordings?: boolean;
  /** The person's answer to "also save my walks in my account" (ADR-35); nothing is uploaded until it is yes. */
  saveWalks?: boolean;
  /** Which acoustic model listens (ADR-31); absent means the one every installation has. */
  detectionModel?: DetectionModel;
  /** Whether a doubtful call must be heard twice (ADR-30); absent means it must. */
  detectionStyle?: DetectionStyle;
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
