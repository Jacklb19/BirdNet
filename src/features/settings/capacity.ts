import { bytesToMib, MIN_QUEUE_BYTES, mibToBytes } from '../offline/offline.constants';

/** Why a capacity cannot be chosen right now, or null when it can. */
export type CapacityRejection = 'belowMinimum' | 'belowUsage' | null;

/**
 * The queue never drops pending songs to make room (they would be lost), so a capacity below what is
 * already stored is refused, exactly as the store itself would refuse it.
 */
export function capacityRejection(capacityBytes: number, usedBytes: number): CapacityRejection {
  if (!Number.isSafeInteger(capacityBytes) || capacityBytes < MIN_QUEUE_BYTES) return 'belowMinimum';
  if (capacityBytes < usedBytes) return 'belowUsage';
  return null;
}

export interface CapacityChoice {
  readonly bytes: number;
  readonly allowed: boolean;
}

/**
 * The offered capacities in ascending order, plus the current one when it is not among them (an earlier
 * version may have stored another value), so the picker always shows the real setting.
 */
export function capacityChoices(optionsMib: readonly number[], currentBytes: number, usedBytes: number): CapacityChoice[] {
  const sizes = new Set(optionsMib.map(mibToBytes));
  sizes.add(currentBytes);
  return [...sizes]
    .filter((bytes) => bytes === currentBytes || capacityRejection(bytes, 0) === null)
    .sort((first, second) => first - second)
    .map((bytes) => ({ bytes, allowed: bytes === currentBytes || capacityRejection(bytes, usedBytes) === null }));
}

/** Queued space as shown: in MiB, or flagged as below the smallest step the display can show. */
export interface UsageAmount {
  readonly mib: number;
  readonly belowDisplay: boolean;
}

/**
 * A few pending songs weigh a few KiB, which rounds to "0 MiB" and reads as an empty queue. Anything above
 * zero but under the smallest displayable step is reported as "under" that step instead.
 */
export function usageAmount(usedBytes: number, fractionDigits: number): UsageAmount {
  const smallestStep = 10 ** -fractionDigits;
  const mib = bytesToMib(Math.max(0, usedBytes));
  return mib > 0 && mib < smallestStep ? { mib: smallestStep, belowDisplay: true } : { mib, belowDisplay: false };
}
