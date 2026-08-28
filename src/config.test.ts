import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { loadConfig } from './config.js';

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function configFile(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-test-'));
  tempDirs.push(dir);
  const path = join(dir, 'harness.yaml');
  writeFileSync(path, yaml);
  return path;
}

test('accepts logs: json', () => {
  const config = loadConfig(configFile('boot:\n  - name: api\n    logs: json\n    script: echo hi\n'));
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
