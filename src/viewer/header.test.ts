import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LogEvent } from '../events.js';
import { initialState, reduce } from '../state.js';
import { phaseLabel, serviceLabel, services } from './header.js';

const system = (line: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  step: 'stepwyre',
  stream: 'system',
  line,
  ts: 1,
  ...extra,
});

test('services lists top-level keepalive steps with status and port', () => {
  let state = initialState([]);
  state = reduce(
    state,
    system('oneoff env started', { kind: 'step', subject: 'env', props: { lifecycle: 'oneoff' } }),
  );
  state = reduce(
    state,
    system('keepalive stack started', {
      kind: 'step',
      subject: 'stack',
      props: { lifecycle: 'keepalive', pg_port: '5432' },
    }),
  );
  state = reduce(state, system('keepalive stack ready', { kind: 'ready', subject: 'stack' }));
  state = reduce(
    state,
    system('keepalive userapi started', {
      kind: 'step',
      subject: 'userapi',
      props: { lifecycle: 'keepalive', port: '4001' },
    }),
  );
  state = reduce(
    state,
    system('keepalive start started', {
      kind: 'step',
      subject: 'userapi/start',
      step: 'userapi/stepwyre',
      props: { lifecycle: 'keepalive' },
    }),
  );
  assert.deepEqual(services(state).map(serviceLabel), [
    'stack ● ready',
    'userapi ◐ starting :4001',
  ]);
});

test('phase label names the failing step', () => {
  let state = initialState([]);
  assert.equal(phaseLabel(state), 'booting');
  state = reduce(state, system('boot complete', { kind: 'boot' }));
  assert.equal(phaseLabel(state), 'up');
  state = reduce(
    state,
    system('step migrate failed with code 1', { kind: 'failed', subject: 'migrate' }),
  );
  assert.equal(phaseLabel(state), 'failed (migrate)');
});
