import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dumpLines } from './dump.js';
import { layout, BODY_INDENT, type ViewEntry } from './layout.js';

const plain: ViewEntry = { id: 1, step: 'db', stream: 'stdout', raw: 'plain line' };
const json: ViewEntry = {
  id: 2,
  step: 'api',
  stream: 'stdout',
  raw: '{"msg":"hi"}',
  json: { message: 'hi', severity: 'info', pretty: '{\n  "msg": "hi"\n}' },
};

function byId(entries: ViewEntry[]): Map<number, ViewEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

test('plain and collapsed json rows render with prefix and arrow', () => {
  const rows = layout([plain, json], new Set(), 80);
  const lines = dumpLines(rows, byId([plain, json]), new Set(), 5);
  assert.deepEqual(lines, ['db   plain line', 'api  ▸ hi']);
});

test('expanded json keeps arrow and indented body lines', () => {
  const expanded = new Set([2]);
  const rows = layout([json], expanded, 80);
  const lines = dumpLines(rows, byId([json]), expanded, 5);
  assert.equal(lines[0], 'api  ▾ hi');
  assert.equal(lines[1], ' '.repeat(BODY_INDENT) + '{');
  assert.equal(lines[3], ' '.repeat(BODY_INDENT) + '}');
});

test('rows without a known entry are skipped', () => {
  const rows = layout([plain], new Set(), 80);
  const lines = dumpLines(rows, new Map(), new Set(), 5);
  assert.deepEqual(lines, []);
});
