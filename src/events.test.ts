import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LineSplitter, MAX_LINE } from './events.js';

test('splits complete lines and keeps the partial rest', () => {
  const splitter = new LineSplitter();
  assert.deepEqual(splitter.push('a\nb\nc'), ['a', 'b']);
  assert.deepEqual(splitter.push('d\n'), ['cd']);
});

test('flush emits the pending partial line once', () => {
  const splitter = new LineSplitter();
  splitter.push('tail without newline');
  assert.deepEqual(splitter.flush(), ['tail without newline']);
  assert.deepEqual(splitter.flush(), []);
});

test('strips carriage returns from CRLF input', () => {
  const splitter = new LineSplitter();
  assert.deepEqual(splitter.push('a\r\nb\r\n'), ['a', 'b']);
});

test('force-flushes a line exceeding MAX_LINE', () => {
  const splitter = new LineSplitter();
  const lines = splitter.push('x'.repeat(MAX_LINE + 5));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.length, MAX_LINE);
  assert.deepEqual(splitter.flush(), ['xxxxx']);
});
