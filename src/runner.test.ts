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
    ['--import', 'tsx', 'src/index.ts', 'examples/stepwyre.yaml'],
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
      [
        'boot:',
        '  - name: bad',
        '    script: |',
        '      echo starting',
        '      false',
        '  - name: never',
        '    script: echo unreachable',
        '',
      ].join('\n'),
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

test('a oneoff killed by a signal fails the boot with code null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-signal-'));
  try {
    const cfgPath = await configFile(dir, 'boot:\n  - name: doomed\n    script: kill -TERM $$\n');
    const result = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 30000,
    }).catch((err: Error & { code?: number; stderr: string }) => err);
    assert.ok(result instanceof Error, 'harness should exit non-zero');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /step doomed failed with code null/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('captured env round-trips newline and equals values and drops the exit marker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-env-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: exporter',
        '    script: |',
        "      export MULTI=$'a\\nb'",
        "      export WITHEQ='x=y'",
        '  - name: reader',
        '    script: |',
        '      test "$MULTI" = $\'a\\nb\' && echo multi-ok',
        '      echo "eq=$WITHEQ"',
        "      env | grep -q '^__harness_exit=' || echo clean-env",
        '',
      ].join('\n'),
    );
    const { stdout } = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 30000,
    });
    assert.match(stdout, /multi-ok/);
    assert.match(stdout, /eq=x=y/);
    assert.match(stdout, /clean-env/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a backgrounded grandchild holding fd 3 does not stall the boot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-fd3-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: bg',
        '    script: |',
        '      sleep 5 >&3 2>/dev/null &',
        '      echo bg-started',
        '  - name: after',
        '    script: echo done',
        '',
      ].join('\n'),
    );
    const started = Date.now();
    const { stdout } = await run(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 30000,
    });
    assert.ok(Date.now() - started < 4000, 'boot should not wait for the grandchild');
    assert.match(stdout, /bg-started/);
    assert.match(stdout, /done/);
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
    const tick = envelopes.find(
      (candidate) => candidate.step === 'sub/app' && candidate.json === true,
    );
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

const harness = (cfgPath: string, extra: string[] = []) =>
  run(process.execPath, ['--import', 'tsx', 'src/index.ts', ...extra, cfgPath], {
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 30000,
  });

type Failure = Error & { code?: number; stdout: string; stderr: string };

test('a keepalive dying outside teardown ends the run with a failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-keepalive-exit-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: keep',
        '    lifecycle: keepalive',
        '    script: exit 1',
        '  - name: after',
        '    script: sleep 3',
        '',
      ].join('\n'),
    );
    const started = Date.now();
    const result = await harness(cfgPath).catch((err: Failure) => err);
    assert.ok(result instanceof Error, 'harness should exit non-zero');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /keepalive keep exited \(1\)/);
    assert.ok(Date.now() - started < 2500, 'the in-flight oneoff should be torn down');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the run stays alive after boot while a keepalive lives and ends when it exits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-linger-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: svc',
        '    lifecycle: keepalive',
        '    script: sleep 1',
        '  - name: last',
        '    script: echo booted',
        '',
      ].join('\n'),
    );
    const started = Date.now();
    const { stdout, stderr } = await harness(cfgPath);
    assert.match(stdout, /booted/);
    assert.match(stderr, /stepwyre\s+\| boot complete/);
    assert.ok(Date.now() - started >= 900, 'run should outlive the boot while svc sleeps');
    assert.match(stderr, /keepalive svc exited \(0\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ready script blocks the next step until it passes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-ready-'));
  try {
    const flag = join(dir, 'up');
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: svc',
        '    lifecycle: keepalive',
        '    ready:',
        `      script: test -f ${flag}`,
        '      interval: 0.1',
        '    script: |',
        '      sleep 0.6',
        `      touch ${flag}`,
        '      sleep 1',
        '  - name: next',
        `    script: test -f ${flag} && echo saw-flag`,
        '',
      ].join('\n'),
    );
    const { stdout, stderr } = await harness(cfgPath);
    assert.match(stdout, /saw-flag/);
    assert.match(stderr, /keepalive svc ready/);
    assert.match(stderr, /boot complete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ready timeout fails the boot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-ready-timeout-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: svc',
        '    lifecycle: keepalive',
        '    ready:',
        '      script: false',
        '      interval: 0.1',
        '      timeout: 0.5',
        '    script: sleep 30',
        '  - name: never',
        '    script: echo unreachable',
        '',
      ].join('\n'),
    );
    const result = await harness(cfgPath).catch((err: Failure) => err);
    assert.ok(result instanceof Error, 'harness should exit non-zero');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /keepalive svc not ready after 0.5s/);
    assert.doesNotMatch(result.stdout, /unreachable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a keepalive dying before ready fails the boot at once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-ready-died-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: svc',
        '    lifecycle: keepalive',
        '    ready:',
        '      script: false',
        '      timeout: 20',
        '    script: exit 3',
        '',
      ].join('\n'),
    );
    const started = Date.now();
    const result = await harness(cfgPath).catch((err: Failure) => err);
    assert.ok(result instanceof Error, 'harness should exit non-zero');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /keepalive svc exited \(3\)/);
    assert.ok(Date.now() - started < 5000, 'should not wait for the ready timeout');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ready: nested waits for the sub-harness boot and json carries kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-ready-nested-'));
  try {
    const innerPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: slow',
        '    script: sleep 0.6',
        '  - name: svc',
        '    lifecycle: keepalive',
        '    script: sleep 1',
        '',
      ].join('\n'),
    );
    const outerPath = join(dir, 'outer.yaml');
    await writeFile(
      outerPath,
      [
        'boot:',
        '  - name: sub',
        '    lifecycle: keepalive',
        '    ready: nested',
        `    script: ${process.execPath} --import tsx src/index.ts ${innerPath}`,
        '  - name: after',
        '    script: echo after-sub',
        '',
      ].join('\n'),
    );
    const { stdout } = await harness(outerPath, ['--json']);
    const envelopes = stdout
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const innerBoot = envelopes.findIndex((e) => e.step === 'sub/stepwyre' && e.kind === 'boot');
    const subReady = envelopes.findIndex((e) => e.step === 'stepwyre' && e.kind === 'ready');
    const afterLine = envelopes.findIndex((e) => e.step === 'after' && e.line === 'after-sub');
    const outerBoot = envelopes.findIndex((e) => e.step === 'stepwyre' && e.kind === 'boot');
    assert.ok(innerBoot >= 0, 'inner boot event');
    assert.ok(subReady > innerBoot, 'sub ready after inner boot');
    assert.ok(afterLine > subReady, 'after runs once sub is ready');
    assert.ok(outerBoot > afterLine, 'outer boot complete last');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function spawnHarness(cfgPath: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', cfgPath], {
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    output.stdout += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    output.stderr += chunk;
  });
  const exit = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  return { child, output, exit };
}

test('teardown waits for a keepalive that shuts down slowly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-slow-stop-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: slow',
        '    lifecycle: keepalive',
        '    script: |',
        "      trap 'echo draining; sleep 0.7; echo drained; exit 0' TERM",
        '      echo up',
        '      while :; do sleep 0.1; done',
        '',
      ].join('\n'),
    );
    const { child, output, exit } = spawnHarness(cfgPath);
    await waitUntil(() => Promise.resolve(output.stderr.includes('boot complete')), 8000);
    child.kill('SIGTERM');
    assert.equal(await exit, 143);
    assert.match(output.stdout, /drained/);
    assert.match(output.stderr, /stopping 1 step/);
    assert.match(output.stderr, /keepalive slow exited \(0\)/);
    assert.match(output.stderr, /teardown complete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('teardown kills a keepalive that ignores SIGTERM after stop_timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-stubborn-'));
  const marker = `sleep ${400000 + process.pid}`;
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: stubborn',
        '    lifecycle: keepalive',
        '    stop_timeout: 0.5',
        '    script: |',
        "      trap '' TERM",
        `      ${marker} &`,
        '      wait',
        '',
      ].join('\n'),
    );
    const { child, output, exit } = spawnHarness(cfgPath);
    await waitUntil(() => Promise.resolve(output.stderr.includes('boot complete')), 8000);
    await waitUntil(() => pgrepFound(marker), 4000);
    const started = Date.now();
    child.kill('SIGTERM');
    assert.equal(await exit, 143);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 400 && elapsed < 5000, `teardown took ${elapsed}ms`);
    assert.match(output.stderr, /killed stubborn after 0.5s/);
    const gone = await waitUntil(async () => !(await pgrepFound(marker)), 3000, 100);
    assert.equal(gone, true, 'process group should be killed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second SIGINT during teardown kills at once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harness-double-int-'));
  try {
    const cfgPath = await configFile(
      dir,
      [
        'boot:',
        '  - name: stubborn',
        '    lifecycle: keepalive',
        '    stop_timeout: 30',
        '    script: |',
        "      trap '' INT TERM",
        '      while :; do sleep 0.1; done',
        '',
      ].join('\n'),
    );
    const { child, output, exit } = spawnHarness(cfgPath);
    await waitUntil(() => Promise.resolve(output.stderr.includes('boot complete')), 8000);
    child.kill('SIGINT');
    await waitUntil(() => Promise.resolve(output.stderr.includes('stopping 1 step')), 4000);
    const started = Date.now();
    child.kill('SIGINT');
    assert.equal(await exit, 130);
    assert.ok(Date.now() - started < 3000, 'second signal should not wait for the grace period');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
