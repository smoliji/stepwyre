import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);

test('non-TTY run prefixes child output and reports lifecycle events', async () => {
  const { stdout, stderr } = await run(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts', 'examples/harness.yaml'],
    { env: { ...process.env, NO_COLOR: '1' }, timeout: 30000 },
  );
  assert.match(stdout, /db_tunnel\s+\| db_tunnel listening on \d+/);
  assert.match(stdout, /app_start\s+\| app SQL_PORT=\d+/);
  assert.match(stderr, /stepwyre\s+\| keepalive db_tunnel started/);
  assert.match(stderr, /stepwyre\s+\| oneoff envs done/);
});

async function configFile(dir: string, yaml: string): Promise<string> {
  const path = join(dir, 'config.yaml');
  await writeFile(path, yaml);
  return path;
}

test('a oneoff whose last command fails aborts the boot with its exit code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-fail-'));
  try {
    const cfgPath = await configFile(
      dir,
      ['boot:', '  - name: bad', '    script: |', '      echo starting', '      false', '  - name: never', '    script: echo unreachable', ''].join('\n'),
    );
    const result = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 30000,
    }).catch((err: Error & { code?: number; stdout: string; stderr: string }) => err);
    assert.ok(result instanceof Error, 'harness should exit non-zero');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /step bad failed with code 1/);
    assert.doesNotMatch(result.stdout, /unreachable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('steps see CI=true unless the caller already set CI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-ci-'));
  try {
    const cfgPath = await configFile(
      dir,
      'boot:\n  - name: probe\n    script: echo "ci=$CI logs_json=$LOGS_JSON"\n',
    );
    const bare: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    delete bare.CI;
    delete bare.LOGS_JSON;
    const defaulted = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: bare,
      timeout: 30000,
    });
    assert.match(defaulted.stdout, /ci=true logs_json=1/);

    const respected = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...bare, CI: 'nope' },
      timeout: 30000,
    });
    assert.match(respected.stdout, /ci=nope/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('nested harness envelopes compose step names in the outer sink', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-nested-'));
  try {
    const innerPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: app',
        '    logs: json',
        '    script: |',
        '      echo \'{"level":30,"msg":"tick one"}\'',
        '      echo plain banner',
        '',
      ].join('\n'),
    );
    const outerCfg = [
      'boot:',
      '  - name: sub',
      `    script: ${process.execPath} --import tsx src/index.ts ${innerPath}`,
      '',
    ].join('\n');
    const { writeFile: write } = await import('node:fs/promises');
    const outerPath = join(dir, 'outer.yaml');
    await write(outerPath, outerCfg);

    const bare: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    delete bare.LOGS_JSON;

    const stream = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', outerPath], {
      env: bare,
      timeout: 30000,
    });
    assert.match(stream.stdout, /sub\/app\s+\| tick one/);
    assert.match(stream.stdout, /sub\/app\s+\| plain banner/);
    assert.match(stream.stderr, /sub\/stepwyre\s+\| oneoff app done/);

    const machine = await run(
      process.execPath,
      ['--import', 'tsx', 'src/index.ts', '--json', outerPath],
      { env: bare, timeout: 30000 },
    );
    const envelopes = machine.stdout
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const tick = envelopes.find((candidate) => candidate.step === 'sub/app' && candidate.json === true);
    assert.ok(tick, 'expected a json-flagged envelope from the nested step');
    assert.equal(tick.line, '{"level":30,"msg":"tick one"}');
    assert.ok(envelopes.every((candidate) => candidate['@log'] === 1));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function pgrepFound(pattern: string): Promise<boolean> {
  try {
    const { stdout } = await run('pgrep', ['-f', pattern]);
    return stdout.trim().length > 0;
  } catch (err) {
    if ((err as { code?: number }).code === 1) return false;
    throw err;
  }
}

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

test('SIGTERM tears down the in-flight oneoff child, not just keepalives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-teardown-'));
  const marker = `sleep ${300000 + process.pid}`;
  try {
    const cfgPath = join(dir, 'config.yaml');
    await writeFile(
      cfgPath,
      [
        'boot:',
        '  - name: keep',
        '    lifecycle: keepalive',
        '    script: |',
        '      echo keepalive started',
        '      exec sleep 30',
        '  - name: oneoff',
        `    script: exec ${marker}`,
        '',
      ].join('\n'),
    );

    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stdout?.resume();
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const keptaliveStarted = await waitUntil(
      () => Promise.resolve(stderr.includes('keepalive keep started')),
      8000,
    );
    assert.equal(keptaliveStarted, true, 'keepalive should have started');

    const oneoffRunning = await waitUntil(() => pgrepFound(marker), 4000);
    assert.equal(oneoffRunning, true, 'oneoff child should be running before teardown');

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
      child.kill('SIGTERM');
    });
    assert.equal(exitCode, 143);

    const stillRunning = await waitUntil(() => pgrepFound(marker), 3000, 100);
    assert.equal(stillRunning, false, 'oneoff child should be killed on teardown');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
