import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, stripAnsi, BODY_INDENT, type ViewEntry } from './layout.js';

const plain: ViewEntry = { id: 1, step: 'db', stream: 'stdout', raw: 'plain line' };
const json: ViewEntry = {
  id: 2,
  step: 'api',
  stream: 'stdout',
  raw: '{"msg":"hi"}',
  json: { message: 'hi', severity: 'info', pretty: '{\n  "msg": "hi"\n}' },
};

test('collapsed: one head row per entry', () => {
  const rows = layout([plain, json], new Set(), 80);
  assert.deepEqual(rows, [
    { entryId: 1, kind: 'head', text: 'plain line' },
    { entryId: 2, kind: 'head', text: 'hi' },
  ]);
});

test('expanded json entry appends indented body rows', () => {
  const rows = layout([json], new Set([2]), 80);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1], { entryId: 2, kind: 'body', text: ' '.repeat(BODY_INDENT) + '{' });
  assert.deepEqual(rows[3], { entryId: 2, kind: 'body', text: ' '.repeat(BODY_INDENT) + '}' });
});

test('body lines hard-wrap to width minus indent', () => {
  const wide: ViewEntry = {
    id: 3,
    step: 'api',
    stream: 'stdout',
    raw: '{}',
    json: { message: 'x', severity: 'info', pretty: 'a'.repeat(20) },
  };
  const rows = layout([wide], new Set([3]), 10 + BODY_INDENT);
  const bodies = rows.filter((row) => row.kind === 'body');
  assert.deepEqual(bodies.map((row) => row.text.trimStart()), ['a'.repeat(10), 'a'.repeat(10)]);
});

test('stripAnsi removes SGR and CSI sequences but keeps plain brackets', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m and \x1b[2Kclear'), 'red and clear');
  assert.equal(stripAnsi('LOG: [info] ok'), 'LOG: [info] ok');
});
