import { describe, expect, it } from 'vitest';
import { DEFAULT_QUEUE_BYTES, MIN_QUEUE_BYTES, mibToBytes } from '../offline/offline.constants';
import { capacityChoices, capacityRejection, usageAmount } from './capacity';
import { CAPACITY_OPTIONS_MIB } from './settings.config';

describe('capacityRejection', () => {
  it('accepts a capacity that holds what is already stored', () => {
    expect(capacityRejection(mibToBytes(16), mibToBytes(16))).toBeNull();
    expect(capacityRejection(mibToBytes(32), mibToBytes(3))).toBeNull();
  });

  it('refuses a capacity below the stored songs, which would otherwise be lost', () => {
    expect(capacityRejection(mibToBytes(16), mibToBytes(16) + 1)).toBe('belowUsage');
  });

  it('refuses sizes the store does not accept', () => {
    expect(capacityRejection(MIN_QUEUE_BYTES - 1, 0)).toBe('belowMinimum');
    expect(capacityRejection(Number.NaN, 0)).toBe('belowMinimum');
  });
});

describe('capacityChoices', () => {
  it('lists the offered capacities in ascending order and marks those below the usage', () => {
    const choices = capacityChoices([64, 16, 32], mibToBytes(64), mibToBytes(20));
    expect(choices).toEqual([
      { bytes: mibToBytes(16), allowed: false },
      { bytes: mibToBytes(32), allowed: true },
      { bytes: mibToBytes(64), allowed: true },
    ]);
  });

  it('keeps a current capacity that is not among the options, so the picker shows the real setting', () => {
    const current = mibToBytes(48);
    const choices = capacityChoices([32, 64], current, mibToBytes(40));
    expect(choices.map((choice) => choice.bytes)).toEqual([mibToBytes(32), current, mibToBytes(64)]);
    expect(choices.find((choice) => choice.bytes === current)?.allowed).toBe(true);
  });

  it('offers only capacities the store accepts, including the default', () => {
    const choices = capacityChoices(CAPACITY_OPTIONS_MIB, DEFAULT_QUEUE_BYTES, 0);
    expect(choices.every((choice) => choice.allowed && choice.bytes >= MIN_QUEUE_BYTES)).toBe(true);
    expect(choices).toHaveLength(new Set(CAPACITY_OPTIONS_MIB).size);
    expect(choices.map((choice) => choice.bytes)).toContain(DEFAULT_QUEUE_BYTES);
  });
});

describe('usageAmount', () => {
  it('reports a few KiB as under the smallest shown step instead of an empty queue', () => {
    expect(usageAmount(2_400, 1)).toEqual({ mib: 0.1, belowDisplay: true });
  });

  it('keeps zero and larger amounts as they are', () => {
    expect(usageAmount(0, 1)).toEqual({ mib: 0, belowDisplay: false });
    expect(usageAmount(mibToBytes(12), 1)).toEqual({ mib: 12, belowDisplay: false });
  });
});
