import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { loadConfig, loadConfigs } from './config.js';

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function configFile(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-test-'));
  tempDirs.push(dir);
  const path = join(dir, 'stepwyre.yaml');
  writeFileSync(path, yaml);
  return path;
}

test('accepts logs: json', () => {
  const config = loadConfig(
    configFile('boot:\n  - name: api\n    logs: json\n    script: echo hi\n'),
  );
  assert.equal(config.boot[0]!.logs, 'json');
});

test('logs is optional', () => {
  const config = loadConfig(configFile('boot:\n  - name: api\n    script: echo hi\n'));
  assert.equal(config.boot[0]!.logs, undefined);
});

test('rejects unknown logs value', () => {
  assert.throws(
    () => loadConfig(configFile('boot:\n  - name: api\n    logs: xml\n    script: echo hi\n')),
    /logs/,
  );
});

test('rejects non-array boot', () => {
  assert.throws(() => loadConfig(configFile('boot: 5\n')), /array property 'boot'/);
});

test('rejects step without name', () => {
  assert.throws(() => loadConfig(configFile('boot:\n  - script: echo hi\n')), /string 'name'/);
});

test('rejects step without script', () => {
  assert.throws(() => loadConfig(configFile('boot:\n  - name: api\n')), /'api' \(0\)/);
});

test('rejects unknown lifecycle value', () => {
  assert.throws(
    () =>
      loadConfig(configFile('boot:\n  - name: api\n    lifecycle: forever\n    script: echo hi\n')),
    /invalid lifecycle/,
  );
});

test('lifecycle defaults to oneoff', () => {
  const config = loadConfig(configFile('boot:\n  - name: api\n    script: echo hi\n'));
  assert.equal(config.boot[0]!.lifecycle, 'oneoff');
});

test('accepts lifecycle: keepalive', () => {
  const config = loadConfig(
    configFile('boot:\n  - name: api\n    lifecycle: keepalive\n    script: echo hi\n'),
  );
  assert.equal(config.boot[0]!.lifecycle, 'keepalive');
});

test('loadConfigs merges steps in argument order', () => {
  const config = loadConfigs([
    configFile('boot:\n  - name: api\n    script: echo hi\n'),
    configFile('boot:\n  - name: web\n    script: echo ho\n'),
  ]);
  assert.deepEqual(
    config.boot.map((step) => step.name),
    ['api', 'web'],
  );
});

test('loadConfigs rejects duplicate step names', () => {
  const file = () => configFile('boot:\n  - name: api\n    script: echo hi\n');
  assert.throws(() => loadConfigs([file(), file()]), /duplicate step name 'api'/);
});

test('accepts ready with a script and defaults for interval and timeout', () => {
  const config = loadConfig(
    configFile(
      [
        'boot:',
        '  - name: db',
        '    lifecycle: keepalive',
        '    ready:',
        '      script: pg_isready',
        '    script: postgres',
        '',
      ].join('\n'),
    ),
  );
  assert.deepEqual(config.boot[0]!.ready, { script: 'pg_isready', interval: 1, timeout: 60 });
});

test('accepts ready interval and timeout in seconds', () => {
  const config = loadConfig(
    configFile(
      [
        'boot:',
        '  - name: db',
        '    lifecycle: keepalive',
        '    ready:',
        '      script: pg_isready',
        '      interval: 0.5',
        '      timeout: 120',
        '    script: postgres',
        '',
      ].join('\n'),
    ),
  );
  assert.deepEqual(config.boot[0]!.ready, { script: 'pg_isready', interval: 0.5, timeout: 120 });
});

test('accepts ready: nested for a sub-harness step', () => {
  const config = loadConfig(
    configFile(
      'boot:\n  - name: sub\n    lifecycle: keepalive\n    ready: nested\n    script: stepwyre x.yaml\n',
    ),
  );
  assert.deepEqual(config.boot[0]!.ready, { nested: true });
});

test('rejects ready on a oneoff step', () => {
  assert.throws(
    () =>
      loadConfig(
        configFile('boot:\n  - name: a\n    ready:\n      script: true\n    script: echo hi\n'),
      ),
    /ready.*keepalive/,
  );
});

test('rejects ready without a script', () => {
  assert.throws(
    () =>
      loadConfig(
        configFile(
          'boot:\n  - name: a\n    lifecycle: keepalive\n    ready:\n      timeout: 5\n    script: sleep 1\n',
        ),
      ),
    /ready.*script/,
  );
});

test('rejects a non-positive ready timeout', () => {
  assert.throws(
    () =>
      loadConfig(
        configFile(
          'boot:\n  - name: a\n    lifecycle: keepalive\n    ready:\n      script: true\n      timeout: 0\n    script: sleep 1\n',
        ),
      ),
    /ready.*timeout/,
  );
});
