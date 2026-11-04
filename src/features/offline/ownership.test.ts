import { describe, expect, it } from 'vitest';
import { ownedBy } from './ownership';

const MINE = '7b0a3c1e-5d2f-4a8b-9c6d-0e1f2a3b4c5d';
const THEIRS = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('ownedBy', () => {
  const rows = [{ id: 'a', owner: MINE }, { id: 'b', owner: THEIRS }, { id: 'c', owner: null }, { id: 'd' }];

  it('keeps only the signed-in account\'s rows, never another account\'s or those without an owner', () => {
    expect(ownedBy(rows, MINE).map((row) => row.id)).toEqual(['a']);
  });

  it('shows nothing without anyone signed in', () => {
    expect(ownedBy(rows, null)).toEqual([]);
  });
});
