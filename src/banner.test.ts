import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBanner } from './banner.js';

test('plain banner shows the stair mark, name, step count, and config paths', () => {
  const banner = renderBanner(3, ['dev.yaml'], false);
  assert.equal(banner, '\n        ┌────●\n   ┌────┘      stepwyre · 3 steps · dev.yaml\n●──┘\n\n');
});

test('single step is not pluralized, multiple paths join with a space', () => {
  const banner = renderBanner(1, ['infra.yaml', 'app.yaml'], false);
  assert.ok(banner.includes('stepwyre · 1 step · infra.yaml app.yaml'));
});

test('colored banner wraps the mark in copper and keeps the text intact', () => {
  const banner = renderBanner(2, ['dev.yaml'], true);
  assert.ok(banner.includes('\x1b[38;5;208m'));
  assert.ok(banner.includes('stepwyre'));
  assert.ok(banner.includes('2 steps'));
});
