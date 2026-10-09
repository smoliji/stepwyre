import { createWriteStream, type WriteStream } from 'node:fs';
import { envelope } from './envelope.js';
import type { LogEvent } from './events.js';
import type { Sink } from './sink.js';

/** Fans every event out to several sinks. */
export class TeeSink implements Sink {
  constructor(private sinks: Sink[]) {}

  event(event: LogEvent): void {
    for (const sink of this.sinks) sink.event(event);
  }

  async close(): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.close()));
  }
}

/** Appends NDJSON envelopes to a file, the same lines as --json prints. */
export class LogFileSink implements Sink {
  private out: WriteStream;

  constructor(path: string) {
    this.out = createWriteStream(path, { flags: 'w' });
  }

  event(event: LogEvent): void {
    this.out.write(`${envelope(event)}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.out.end(resolve));
  }
}
