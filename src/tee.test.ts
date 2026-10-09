import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogEvent } from './events.js';
import type { Sink } from './sink.js';
import { LogFileSink, TeeSink } from './tee.js';

test('TeeSink forwards events and closes every sink', async () => {
  const seen: string[] = [];
  const make = (tag: string): Sink => ({
    event: (event) => seen.push(`${tag}:${event.line}`),
    close: async () => void seen.push(`${tag}:closed`),
  });
  const tee = new TeeSink([make('a'), make('b')]);
  tee.event({ step: 'x', stream: 'stdout', line: 'hi', ts: 1 });
  await tee.close();
  assert.deepEqual(seen, ['a:hi', 'b:hi', 'a:closed', 'b:closed']);
});

test('LogFileSink writes one envelope per line and flushes on close', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tee-'));
  try {
    const path = join(dir, 'log.ndjson');
    const sink = new LogFileSink(path);
    const event: LogEvent = {
      step: 'stepwyre',
      stream: 'system',
      line: 'boot complete',
      ts: 1,
      kind: 'boot',
    };
    sink.event(event);
    sink.event({ step: 'app', stream: 'stdout', line: 'hello', ts: 2 });
    await sink.close();
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).kind, 'boot');
    assert.equal(JSON.parse(lines[1]!).line, 'hello');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
