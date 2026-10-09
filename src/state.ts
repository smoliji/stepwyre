import { renameSync, writeFileSync } from 'node:fs';
import type { LogEvent } from './events.js';
import type { Sink } from './sink.js';

export type Phase = 'booting' | 'up' | 'stopping' | 'failed' | 'stopped';
export type StepStatus = 'running' | 'done' | 'ready' | 'exited' | 'failed';

export interface StepState {
  lifecycle: string;
  status: StepStatus;
  props: Record<string, string>;
}

export interface RunState {
  pid: number;
  configs: string[];
  started: number;
  phase: Phase;
  code?: number | string | null;
  steps: Record<string, StepState>;
}

export function initialState(configs: string[], pid = process.pid): RunState {
  return { pid, configs, started: Date.now(), phase: 'booting', steps: {} };
}

const statusOf: Partial<Record<NonNullable<LogEvent['kind']>, StepStatus>> = {
  step: 'running',
  done: 'done',
  ready: 'ready',
  exited: 'exited',
  failed: 'failed',
};

export function reduce(state: RunState, event: LogEvent): RunState {
  if (event.stream !== 'system' || !event.kind) return state;

  if (event.subject !== undefined) {
    const status = statusOf[event.kind];
    if (!status) return state;
    const previous = state.steps[event.subject];
    const props = event.props ?? previous?.props ?? {};
    const lifecycle = props.lifecycle ?? previous?.lifecycle ?? 'oneoff';
    const { lifecycle: _lifecycle, name: _name, ...rest } = props;
    state.steps[event.subject] = { lifecycle, status, props: rest };
  }

  // only the root stepwyre moves the run phase; nested ones are steps here
  if (event.step !== 'stepwyre') return state;
  if (event.kind === 'boot') state.phase = 'up';
  if (event.kind === 'stop') state.phase = 'stopping';
  if (event.kind === 'failed') state.phase = 'failed';
  if (event.kind === 'end') {
    state.code = event.code;
    // 130 and 143 are the user's own Ctrl+C or SIGTERM, not a failure
    const clean = event.code === 0 || event.code === 130 || event.code === 143;
    if (state.phase !== 'failed') state.phase = clean ? 'stopped' : 'failed';
  }
  return state;
}

export function writeState(path: string, state: RunState): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, path);
}

/** Tees events into a sink and keeps a state file current. */
export class StateSink implements Sink {
  constructor(
    private inner: Sink,
    private path: string,
    private state: RunState,
  ) {
    writeState(path, state);
  }

  event(event: LogEvent): void {
    this.inner.event(event);
    const before = this.state.phase;
    const stepsBefore = Object.keys(this.state.steps).length;
    this.state = reduce(this.state, event);
    if (
      event.kind ||
      before !== this.state.phase ||
      stepsBefore !== Object.keys(this.state.steps).length
    ) {
      writeState(this.path, this.state);
    }
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
