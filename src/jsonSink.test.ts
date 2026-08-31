import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { JsonSink, envelope, parseEnvelope } from './jsonSink.js';
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

test('JsonSink writes one NDJSON envelope per event to its stream', () => {
  const out = new PassThrough();
  const chunks: string[] = [];
  out.on('data', (chunk) => chunks.push(String(chunk)));
  const sink = new JsonSink(out);
  sink.event(event);
  sink.event({ step: 'stepwyre', stream: 'system', line: 'oneoff env done', ts: 9 });
  const lines = chunks.join('').trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]!)['@log'], 1);
  assert.deepEqual(parseEnvelope(lines[1]!), {
    step: 'stepwyre',
    stream: 'system',
    ts: 9,
    line: 'oneoff env done',
    json: false,
  });
});
