import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { StreamSink } from './sink.js';

// hermetic: an ambient FORCE_COLOR would color the assertions below
process.env.NO_COLOR = '1';
delete process.env.FORCE_COLOR;

function capture() {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk) => chunks.push(String(chunk)));
  return { stream, text: () => chunks.join('') };
}

test('prefixes lines with padded step name, stdout vs stderr routing', () => {
  const out = capture();
  const err = capture();
  const sink = new StreamSink(['api', 'db_tunnel'], out.stream, err.stream);
  sink.event({ step: 'api', stream: 'stdout', line: 'hello', ts: 0 });
  sink.event({ step: 'db_tunnel', stream: 'stderr', line: 'oops', ts: 0 });
  assert.equal(out.text(), 'api        | hello\n');
  assert.equal(err.text(), 'db_tunnel  | oops\n');
});

test('json events print the extracted message', () => {
  const out = capture();
  const sink = new StreamSink(['api'], out.stream, capture().stream);
  sink.event({
    step: 'api',
    stream: 'stdout',
    line: '{"msg":"listening"}',
    ts: 0,
    json: { message: 'listening', severity: 'info', pretty: '{}' },
  });
  assert.equal(out.text(), 'api      | listening\n');
});

test('system events go to stderr with harness prefix', () => {
  const err = capture();
  const sink = new StreamSink([], capture().stream, err.stream);
  sink.event({ step: 'harness', stream: 'system', line: 'keepalive api started', ts: 0 });
  assert.equal(err.text(), 'harness  | keepalive api started\n');
});

test('close waits for pending writes to drain before resolving', async () => {
  const out = capture();
  const sink = new StreamSink(['api'], out.stream, capture().stream);
  sink.event({ step: 'api', stream: 'stdout', line: 'hello', ts: 0 });
  await sink.close();
  assert.equal(out.text(), 'api      | hello\n');
});
