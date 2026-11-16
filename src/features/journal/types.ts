import type { ApproximateLocation } from '../offline/types';

export interface OutingData {
  title: string | null; kind: 'stationary' | 'walk' | 'import'; started_at: string; ended_at: string | null;
  note: string | null; site_id: string | null; walk_id: string | null;
}
export interface ObservationData {
  species: string; observed_at: string; location: ApproximateLocation | null; individuals: number | null;
  note: string | null; outing_id: string | null;
}
export interface CollectionData { name: string; note: string | null }
export interface EntityDataMap { outing: OutingData; observation: ObservationData; collection: CollectionData }
export type EntityKind = keyof EntityDataMap;
export type EntityData = EntityDataMap[EntityKind];
export interface PendingWrite {
  id: string; revision: number; method: 'PUT' | 'DELETE'; expectedVersion: number | null; data: EntityData;
}
export interface EntityRecord<K extends EntityKind> {
  tag: 'entity'; key: string; id: string; owner: string; kind: K; data: EntityDataMap[K];
  version: number | null; revision: number; dirty: boolean; pending: PendingWrite | null;
  deleted: boolean; conflict: boolean; createdAt: string; updatedAt: string;
  remoteDeleted?: boolean;
  localWalkId?: string;
  importState?: 'running' | 'cancelled' | 'completed' | 'failed';
}
export type JournalEntity = { [K in EntityKind]: EntityRecord<K> }[EntityKind];
export interface JournalRelation {
  tag: 'relation'; key: string; owner: string; kind: 'outingDetection' | 'collectionItem' | 'wish';
  parent: string; recordKind: 'detection' | 'observation'; recordId: string;
  present: boolean; revision: number; dirty: boolean; pending: { id: string; revision: number; present: boolean } | null;
  event?: TimelineEvent;
}
export type JournalEntry = JournalEntity | JournalRelation;
export interface ObservationPhoto { key: string; owner: string; id: string; blob: Blob }
export interface JournalSnapshot { entities: JournalEntity[]; relations: JournalRelation[] }
export interface ServerEntity { id: string; version: number; data: EntityData; createdAt: string; updatedAt: string }
interface EventRecord { id: string; recorded_at: string; species: string }
export type TimelineEvent = EventRecord & (
  { kind: 'detection'; confidence: number; status: 'confirmed' | 'provisional' | 'verified' | 'corrected' | 'discarded'; has_recording: boolean }
  | { kind: 'observation'; individuals: number | null }
);
