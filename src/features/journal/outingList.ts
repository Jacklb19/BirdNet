import type { OutingFilter } from '../../app/routes';
import type { WalkView } from '../walk/useWalks';
import type { EntityRecord } from './types';

export type OutingListItem =
  | { readonly kind: 'outing'; readonly startedAt: number; readonly row: EntityRecord<'outing'> }
  | { readonly kind: 'walk'; readonly startedAt: number; readonly walk: WalkView };

/**
 * The outings part of the log (ADR-47): the journal's outings and the saved walks, newest first. A walk is listed on
 * its own only while no outing names it, by the walk id it was saved with or by the phone's own id of a walk not yet
 * uploaded; nothing is matched by coincident times, so a walk is never shown twice nor joined to the wrong outing.
 */
export function outingList(outings: readonly EntityRecord<'outing'>[], walks: readonly WalkView[], filter: OutingFilter): OutingListItem[] {
  const linked = new Set(outings.flatMap((row) => [row.data.walk_id, row.localWalkId].filter((id): id is string => typeof id === 'string')));
  const items: OutingListItem[] = [
    ...outings
      .filter((row) => filter === 'all' || row.data.kind === filter)
      .map((row) => ({ kind: 'outing' as const, startedAt: Date.parse(row.data.started_at), row })),
    ...(filter === 'all' || filter === 'walk' ? walks.filter((walk) => !linked.has(walk.id)).map((walk) => ({ kind: 'walk' as const, startedAt: walk.startedAt, walk })) : []),
  ];
  const key = (item: OutingListItem): string => (item.kind === 'outing' ? item.row.id : item.walk.id);
  return items.sort((left, right) => right.startedAt - left.startedAt || key(left).localeCompare(key(right)));
}
