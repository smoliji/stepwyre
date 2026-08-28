import process from 'node:process';
import type { LogEvent } from './events.js';
import type { Sink } from './sink.js';

const MARKER = '@log';
const streams = new Set(['stdout', 'stderr', 'system']);

export interface Envelope {
  step: string;
  stream: LogEvent['stream'];
  ts: number;
  line: string;
  json: boolean;
}

export function envelope(event: LogEvent): string {
  return JSON.stringify({
    [MARKER]: 1,
    step: event.step,
    stream: event.stream,
    ts: event.ts,
    line: event.line,
    json: event.json !== undefined,
  });
}

export function parseEnvelope(line: string): Envelope | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record[MARKER] !== 1) return undefined;
  if (typeof record.step !== 'string') return undefined;
  if (typeof record.stream !== 'string' || !streams.has(record.stream)) return undefined;
  if (typeof record.line !== 'string') return undefined;
  return {
    step: record.step,
    stream: record.stream as LogEvent['stream'],
    ts: typeof record.ts === 'number' ? record.ts : Date.now(),
    line: record.line,
    json: record.json === true,
  };
}

export class JsonSink implements Sink {
  constructor(private out: NodeJS.WritableStream = process.stdout) {}

  event(event: LogEvent): void {
    this.out.write(`${envelope(event)}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.out.write('', () => resolve()));
  }
}
