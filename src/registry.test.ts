import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'stepwyre-runs-'));
process.env.STEPWYRE_RUNS = dir;
const { findRun, listRuns, register, unregister } = await import('./registry.js');

test('registers live runs and drops records of dead pids', () => {
  try {
    register({ pid: process.pid, configs: ['a.yaml'], started: 2, log: '/tmp/a.ndjson' });
    register({ pid: 2 ** 22 - 1, configs: ['dead.yaml'], started: 1 });
    assert.deepEqual(
      listRuns().map((run) => run.pid),
      [process.pid],
    );
    assert.equal(findRun(process.pid)?.log, '/tmp/a.ndjson');
    assert.deepEqual(readdirSync(dir), [`${process.pid}.json`]);
    unregister(process.pid);
    assert.deepEqual(listRuns(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
