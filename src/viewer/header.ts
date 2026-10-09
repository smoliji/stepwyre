import type { RunState, StepStatus } from '../state.js';

export interface Service {
  name: string;
  status: StepStatus;
  port?: string;
}

export const STATUS_WORD: Record<StepStatus, string> = {
  running: 'starting',
  ready: 'ready',
  done: 'done',
  exited: 'exited',
  failed: 'failed',
};

export const STATUS_GLYPH: Record<StepStatus, string> = {
  running: '◐',
  ready: '●',
  done: '●',
  exited: '○',
  failed: '✖',
};

export function phaseLabel(state: RunState): string {
  if (state.phase === 'failed' && state.failure) return `failed (${state.failure})`;
  return state.phase;
}

/** keepalive steps of this run; nested runs count through their parent step */
export function services(state: RunState): Service[] {
  return Object.entries(state.steps)
    .filter(([name, step]) => step.lifecycle === 'keepalive' && !name.includes('/'))
    .map(([name, step]) => ({ name, status: step.status, port: step.props.port }));
}

export function serviceLabel(service: Service): string {
  const port = service.port ? ` :${service.port}` : '';
  return `${service.name} ${STATUS_GLYPH[service.status]} ${STATUS_WORD[service.status]}${port}`;
}
