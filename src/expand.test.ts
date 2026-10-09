import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStep, type Registry } from './expand.js';

const noRegistry: Registry = {};
const noEnv: Record<string, string> = {};

test('resolves cross-step reference', async () => {
  const registry: Registry = { db: { port: '5432' } };
  const step = { name: 'a', script: 'echo ${db.port}', lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, registry, noEnv);
  assert.equal(resolved.script, 'echo 5432');
});

test('resolves self reference to a prior key', async () => {
  const step = { name: 'a', port: '7777', script: 'run ${port}', lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, noRegistry, noEnv);
  assert.equal(resolved.script, 'run 7777');
  assert.equal(resolved.props.port, '7777');
});

test('resolves ENV references, missing env is empty', async () => {
  const step = {
    name: 'a',
    script: '${ENV.HOME} ${ENV.MISSING}',
    lifecycle: 'oneoff' as const,
  };
  const resolved = await resolveStep(step, noRegistry, { HOME: '/home/me' });
  assert.equal(resolved.script, '/home/me ');
});

test('falls back past a missing env var', async () => {
  const step = {
    name: 'a',
    script: '${ENV.MISSING ?? fallback}',
    lifecycle: 'oneoff' as const,
  };
  const resolved = await resolveStep(step, noRegistry, noEnv);
  assert.equal(resolved.script, 'fallback');
});

test('falls back to a quoted literal past a missing registry prop', async () => {
  const registry: Registry = { db: { port: '5432' } };
  const step = { name: 'a', script: "${db.missing ?? 'lit'}", lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, registry, noEnv);
  assert.equal(resolved.script, 'lit');
});

test('falls back to a bare term past a missing registry prop', async () => {
  const registry: Registry = { db: { port: '5432' } };
  const step = { name: 'a', script: '${db.missing ?? 8080}', lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, registry, noEnv);
  assert.equal(resolved.script, '8080');
});

test('empty quoted fallback resolves to empty string', async () => {
  const registry: Registry = { db: { port: '5432' } };
  const step = { name: 'a', script: "${db.missing ?? ''}", lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, registry, noEnv);
  assert.equal(resolved.script, '');
});

test('rejects an unresolved token', async () => {
  const step = { name: 'a', script: 'echo ${nope}', lifecycle: 'oneoff' as const };
  await assert.rejects(resolveStep(step, noRegistry, noEnv), /unresolved token/);
});

test('rejects an unterminated quote', async () => {
  const step = { name: 'a', script: "echo ${'oops}", lifecycle: 'oneoff' as const };
  await assert.rejects(resolveStep(step, noRegistry, noEnv), /unterminated quote/);
});

test('resolves FREE_PORT to a numeric string', async () => {
  const step = { name: 'a', script: '${FREE_PORT}', lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, noRegistry, noEnv);
  assert.match(resolved.script, /^\d+$/);
});

test('passes through ${ without a closing brace', async () => {
  const step = { name: 'a', script: 'echo ${unclosed', lifecycle: 'oneoff' as const };
  const resolved = await resolveStep(step, noRegistry, noEnv);
  assert.equal(resolved.script, 'echo ${unclosed');
});

test('concatenates tokens and literal text', async () => {
  const registry: Registry = { db: { host: 'localhost', port: '5432' } };
  const step = {
    name: 'a',
    script: 'psql ${db.host}:${db.port}/app',
    lifecycle: 'oneoff' as const,
  };
  const resolved = await resolveStep(step, registry, noEnv);
  assert.equal(resolved.script, 'psql localhost:5432/app');
});
