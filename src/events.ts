import type { JsonLog } from './jsonLog.js';

export type EventKind = 'step' | 'done' | 'ready' | 'exited' | 'failed' | 'boot' | 'stop' | 'end';

export const EVENT_KINDS: ReadonlySet<string> = new Set<EventKind>([
  'step',
  'done',
  'ready',
  'exited',
  'failed',
  'boot',
  'stop',
  'end',
]);

export interface LogEvent {
  step: string;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  ts: number;
  json?: JsonLog;
  /** lifecycle marker on a system line */
  kind?: EventKind;
  /** the step a lifecycle event is about */
  subject?: string;
  /** resolved props, on a `step` event */
  props?: Record<string, string>;
  /** exit code or signal, on `exited` and `end` events */
  code?: number | string | null;
}

/** cap for a plain output line; envelopes from a nested run may be longer */
export const MAX_LINE = 32768;
/** hard cap on buffered input per stream, so a stream without newlines cannot grow unbounded */
export const MAX_BUFFER = 1024 * 1024;

export class LineSplitter {
  private rest = '';

  push(chunk: string): string[] {
    this.rest += chunk;
    const lines: string[] = [];
    let start = 0;
    let newline: number;
    while ((newline = this.rest.indexOf('\n', start)) !== -1) {
      let line = this.rest.slice(start, newline);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      lines.push(line.slice(0, MAX_BUFFER));
      start = newline + 1;
    }
    this.rest = this.rest.slice(start);
    while (this.rest.length >= MAX_BUFFER) {
      lines.push(this.rest.slice(0, MAX_BUFFER));
      this.rest = this.rest.slice(MAX_BUFFER);
    }
    return lines;
  }

  flush(): string[] {
    if (this.rest === '') return [];
    const line = this.rest.slice(0, MAX_BUFFER);
    this.rest = '';
    return [line];
  }
}
