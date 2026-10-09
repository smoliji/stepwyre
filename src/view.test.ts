import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { envelope } from './envelope.js';
import type { LogEvent } from './events.js';
import { followLog } from './view.js';

const line = (event: Partial<LogEvent> & { step: string; line: string }) =>
  envelope({ stream: 'system', ts: 1, ...event }) + '\n';

test('replays the log, follows appended lines and stops at the end event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stepwyre-view-'));
  const path = join(dir, 'log.ndjson');
  try {
    writeFileSync(
      path,
      line({ step: 'stepwyre', line: 'keepalive db started', kind: 'step', subject: 'db' }) +
        'not an envelope\n',
    );
    const seen: LogEvent[] = [];
    const sink = { event: (event: LogEvent) => void seen.push(event), close: async () => {} };
    const done = followLog(path, sink, new Promise(() => {}));
    await delay(50);
    assert.deepEqual(
      seen.map((event) => event.kind),
      ['step'],
    );

    appendFileSync(path, line({ step: 'db', stream: 'stdout', line: 'hello' }));
    appendFileSync(path, line({ step: 'stepwyre', line: 'run ended (0)', kind: 'end', code: 0 }));
    await done;
    assert.deepEqual(
      seen.map((event) => [event.step, event.line]),
      [
        ['stepwyre', 'keepalive db started'],
        ['db', 'hello'],
        ['stepwyre', 'run ended (0)'],
      ],
    );
    assert.equal(seen[2]!.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stop settles the follow before the run ends', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stepwyre-view-'));
  const path = join(dir, 'log.ndjson');
  try {
    writeFileSync(path, '');
    let stop!: () => void;
    const done = followLog(
      path,
      { event: () => {}, close: async () => {} },
      new Promise<void>((resolve) => (stop = resolve)),
    );
    stop();
    await done;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
