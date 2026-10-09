import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendCapped, pruneExpanded } from './buffer.js';
import type { ViewEntry } from './layout.js';

function entry(id: number): ViewEntry {
  return { id, step: 'step', stream: 'stdout', raw: `line ${id}` };
}

test('appendCapped under cap keeps all entries and drops nothing', () => {
  const { next, dropped } = appendCapped([entry(1)], [entry(2), entry(3)], 5);
  assert.deepEqual(
    next.map((e) => e.id),
    [1, 2, 3],
  );
  assert.deepEqual(dropped, []);
});

test('appendCapped over cap drops the oldest and keeps exactly cap', () => {
  const { next, dropped } = appendCapped([entry(1), entry(2)], [entry(3), entry(4)], 3);
  assert.deepEqual(
    next.map((e) => e.id),
    [2, 3, 4],
  );
  assert.deepEqual(
    dropped.map((e) => e.id),
    [1],
  );
});

test('pruneExpanded removes dropped ids', () => {
  const pruned = pruneExpanded(new Set([1, 2, 3]), new Set([2]));
  assert.deepEqual([...pruned], [1, 3]);
});

test('pruneExpanded returns the same reference when no dropped id is expanded', () => {
  const expanded = new Set([1, 3]);
  assert.equal(pruneExpanded(expanded, new Set([2])), expanded);
});
