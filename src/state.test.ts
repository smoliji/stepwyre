import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LogEvent } from './events.js';
import { initialState, reduce } from './state.js';

const system = (line: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  step: 'stepwyre',
  stream: 'system',
  line,
  ts: 1,
  ...extra,
});

test('step events register props without script, name and lifecycle', () => {
  const state = reduce(
    initialState(['a.yaml'], 7),
    system('keepalive db started', {
      kind: 'step',
      subject: 'db',
      props: { name: 'db', lifecycle: 'keepalive', port: '5432', logs: 'json' },
    }),
  );
  assert.deepEqual(state.steps.db, {
    lifecycle: 'keepalive',
    status: 'running',
    props: { port: '5432', logs: 'json' },
  });
  assert.equal(state.phase, 'booting');
  assert.equal(state.pid, 7);
});

test('status follows done, ready, exited and failed while props persist', () => {
  let state = initialState([]);
  state = reduce(
    state,
    system('oneoff env started', { kind: 'step', subject: 'env', props: { lifecycle: 'oneoff' } }),
  );
  state = reduce(state, system('oneoff env done', { kind: 'done', subject: 'env' }));
  assert.equal(state.steps.env?.status, 'done');
  state = reduce(
    state,
    system('keepalive api started', {
      kind: 'step',
      subject: 'api',
      props: { lifecycle: 'keepalive', port: '1' },
    }),
  );
  state = reduce(state, system('keepalive api ready', { kind: 'ready', subject: 'api' }));
  assert.equal(state.steps.api?.status, 'ready');
  assert.equal(state.steps.api?.props.port, '1');
  state = reduce(
    state,
    system('keepalive api exited (1)', { kind: 'exited', subject: 'api', code: 1 }),
  );
  assert.equal(state.steps.api?.status, 'exited');
  state = reduce(state, system('step x failed', { kind: 'failed', subject: 'x' }));
  assert.equal(state.steps.x?.status, 'failed');
  assert.equal(state.phase, 'failed');
});

test('phase moves through up, stopping and stopped on the root events only', () => {
  let state = initialState([]);
  state = reduce(state, system('boot complete', { kind: 'boot', step: 'sub/stepwyre' }));
  assert.equal(state.phase, 'booting');
  state = reduce(state, system('boot complete', { kind: 'boot' }));
  assert.equal(state.phase, 'up');
  state = reduce(state, system('stopping 2 steps', { kind: 'stop' }));
  assert.equal(state.phase, 'stopping');
  state = reduce(state, system('run ended (0)', { kind: 'end', code: 0 }));
  assert.equal(state.phase, 'stopped');
  assert.equal(state.code, 0);
});

test('a non-zero end marks the run failed and a failure sticks through end', () => {
  let state = reduce(initialState([]), system('run ended (1)', { kind: 'end', code: 1 }));
  assert.equal(state.phase, 'failed');
  const signalled = reduce(initialState([]), system('run ended (143)', { kind: 'end', code: 143 }));
  assert.equal(signalled.phase, 'stopped');
  state = initialState([]);
  state = reduce(state, system('step a failed', { kind: 'failed', subject: 'a' }));
  state = reduce(state, system('run ended (1)', { kind: 'end', code: 1 }));
  assert.equal(state.phase, 'failed');
});

test('events without kind or outside the system stream are ignored', () => {
  const state = initialState([]);
  reduce(state, { step: 'api', stream: 'stdout', line: 'hi', ts: 1 });
  reduce(state, system('plain note'));
  assert.deepEqual(state.steps, {});
  assert.equal(state.phase, 'booting');
});
