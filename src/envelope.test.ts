import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envelope, parseEnvelope } from './envelope.js';
import type { LogEvent } from './events.js';

const event: LogEvent = {
  step: 'start',
  stream: 'stdout',
  line: '{"level":30,"msg":"listening"}',
  ts: 123,
  json: { message: 'listening', severity: 'info', pretty: '{}' },
};

test('envelope round-trips through parseEnvelope', () => {
  const parsed = parseEnvelope(envelope(event));
  assert.deepEqual(parsed, {
    step: 'start',
    stream: 'stdout',
    ts: 123,
    line: '{"level":30,"msg":"listening"}',
    json: true,
  });
});

test('plain event envelope carries json: false', () => {
  const parsed = parseEnvelope(envelope({ step: 'db', stream: 'stderr', line: 'oops', ts: 5 }));
  assert.deepEqual(parsed, { step: 'db', stream: 'stderr', ts: 5, line: 'oops', json: false });
});

test('rejects app json without the marker and non-json lines', () => {
  assert.equal(parseEnvelope('{"level":30,"msg":"hi"}'), undefined);
  assert.equal(parseEnvelope('plain text'), undefined);
  assert.equal(parseEnvelope('{"@log":2,"step":"x","stream":"stdout","line":"y"}'), undefined);
  assert.equal(parseEnvelope('{"@log":1,"step":5,"stream":"stdout","line":"y"}'), undefined);
  assert.equal(parseEnvelope('{"@log":1,"step":"x","stream":"weird","line":"y"}'), undefined);
});

test('falls back to Date.now() for a non-numeric ts', () => {
  const parsed = parseEnvelope('{"@log":1,"step":"x","stream":"stdout","line":"y","ts":"oops"}');
  assert.ok(parsed);
  assert.equal(typeof parsed.ts, 'number');
  assert.ok(Number.isFinite(parsed.ts));
});

test('rejects an envelope without a line', () => {
  assert.equal(parseEnvelope('{"@log":1,"step":"x","stream":"stdout"}'), undefined);
});
