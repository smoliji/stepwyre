import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('non-TTY run prefixes child output and reports lifecycle events', async () => {
  const { stdout, stderr } = await run(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts', 'examples/harness.yaml'],
    { env: { ...process.env, NO_COLOR: '1' }, timeout: 30000 },
  );
  assert.match(stdout, /db_tunnel\s+\| db_tunnel listening on \d+/);
  assert.match(stdout, /app_start\s+\| app SQL_PORT=\d+/);
  assert.match(stderr, /harness\s+\| keepalive db_tunnel started/);
  assert.match(stderr, /harness\s+\| oneoff envs done/);
});
