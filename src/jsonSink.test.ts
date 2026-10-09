import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { JsonSink } from './jsonSink.js';
import { parseEnvelope } from './envelope.js';
import type { LogEvent } from './events.js';

const event: LogEvent = {
  step: 'start',
  stream: 'stdout',
  line: '{"level":30,"msg":"listening"}',
  ts: 123,
  json: { message: 'listening', severity: 'info', pretty: '{}' },
};

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
