import process from 'node:process';
import { envelope } from './envelope.js';
import type { LogEvent } from './events.js';
import type { Sink } from './sink.js';

export class JsonSink implements Sink {
  constructor(private out: NodeJS.WritableStream = process.stdout) {}

  event(event: LogEvent): void {
    this.out.write(`${envelope(event)}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.out.write('', () => resolve()));
  }
}
