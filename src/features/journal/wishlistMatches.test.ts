import { expect, it } from 'vitest';
import { WishlistNotices } from './wishlistMatches';

it('announces a possible wished detection once per session without carrying it to another account', () => {
  const notices = new WishlistNotices(); const wanted = new Set(['Turdus fuscater']); const birds = ['Turdus fuscater', 'Zonotrichia capensis'];
  expect(notices.claim('first', 1, birds, wanted)).toEqual(['Turdus fuscater']);
  expect(notices.claim('first', 1, birds, wanted)).toEqual([]);
  expect(notices.claim('first', 2, birds, wanted)).toEqual(['Turdus fuscater']);
  expect(notices.claim('second', 2, birds, new Set())).toEqual([]);
});
