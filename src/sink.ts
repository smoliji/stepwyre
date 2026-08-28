import process from 'node:process';
import type { LogEvent } from './events.js';
import { paint, stepColor } from './log.js';

export interface Sink {
  event(event: LogEvent): void;
  close(): Promise<void>;
}

export class StreamSink implements Sink {
  private pad: number;

  constructor(
    stepNames: string[],
    private out: NodeJS.WritableStream = process.stdout,
    private err: NodeJS.WritableStream = process.stderr,
  ) {
    this.pad = Math.max(...['harness', ...stepNames].map((name) => name.length)) + 2;
  }

  event(event: LogEvent): void {
    const prefix = paint(stepColor(event.step), event.step.padEnd(this.pad));
    const text = event.json ? event.json.message : event.line;
    const target = event.stream === 'stdout' ? this.out : this.err;
    target.write(`${prefix}| ${text}\n`);
  }

  close(): Promise<void> {
    const drain = (stream: NodeJS.WritableStream) =>
      new Promise<void>((resolve) => stream.write('', () => resolve()));
    return Promise.all([drain(this.out), drain(this.err)]).then(() => undefined);
  }
}
