import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollBy, clamp } from './scroll.js';

test('scrolling up disables follow', () => {
  const state = scrollBy({ scrollTop: 50, follow: true }, -3, 100, 20);
  assert.deepEqual(state, { scrollTop: 47, follow: false });
});

test('scrolling to the bottom re-enables follow', () => {
  const state = scrollBy({ scrollTop: 75, follow: false }, 10, 100, 20);
  assert.deepEqual(state, { scrollTop: 80, follow: true });
});

test('scrollTop clamps to [0, totalRows - height]', () => {
  assert.equal(scrollBy({ scrollTop: 2, follow: false }, -10, 100, 20).scrollTop, 0);
  assert.equal(scrollBy({ scrollTop: 95, follow: false }, 10, 100, 20).scrollTop, 80);
});

test('clamp follows the tail while follow is on and content fits', () => {
  assert.deepEqual(clamp({ scrollTop: 0, follow: true }, 100, 20), { scrollTop: 80, follow: true });
  assert.deepEqual(clamp({ scrollTop: 5, follow: false }, 10, 20), { scrollTop: 0, follow: false });
});
