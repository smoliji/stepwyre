import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner executes TypeScript', () => {
  const value: number = 1 + 1;
  assert.equal(value, 2);
});
