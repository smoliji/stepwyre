import { styleText } from 'node:util';
import process from 'node:process';
import type { LogEvent } from './events.js';
import { colorEnabled, stepColor } from './log.js';

export interface Sink {
  event(event: LogEvent): void;
  close(): Promise<void>;
}

export class StreamSink implements Sink {
  private pad: number;

  constructor(
    stepNames: string[],
    private out: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout,
    private err: NodeJS.WritableStream & { isTTY?: boolean } = process.stderr,
    private nested = false,
  ) {
    this.pad = Math.max(...['harness', ...stepNames].map((name) => name.length)) + 2;
  }

  event(event: LogEvent): void {
    const target = event.stream === 'stdout' ? this.out : this.err;
    // nested under another harness: json lines pass through raw so the
    // outer harness can parse them; a prefix would break that
    if (this.nested && event.json) {
      target.write(`${event.line}\n`);
      return;
    }
    const padded = event.step.padEnd(this.pad);
    const prefix = colorEnabled(target) ? styleText(stepColor(event.step), padded) : padded;
    const text = event.json ? event.json.message : event.line;
    target.write(`${prefix}| ${text}\n`);
  }

  close(): Promise<void> {
    const drain = (stream: NodeJS.WritableStream) =>
      new Promise<void>((resolve) => stream.write('', () => resolve()));
    return Promise.all([drain(this.out), drain(this.err)]).then(() => undefined);
  }
}
