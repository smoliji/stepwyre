import type { LogEvent } from './events.js';
import { parseJsonObject } from './jsonLog.js';

const MARKER = '@log';

const isStream = (value: unknown): value is LogEvent['stream'] =>
  value === 'stdout' || value === 'stderr' || value === 'system';

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
  const record = parseJsonObject(line);
  if (!record) return undefined;
  if (record[MARKER] !== 1) return undefined;
  if (typeof record.step !== 'string') return undefined;
  if (!isStream(record.stream)) return undefined;
  if (typeof record.line !== 'string') return undefined;
  return {
    step: record.step,
    stream: record.stream,
    ts: typeof record.ts === 'number' ? record.ts : Date.now(),
    line: record.line,
    json: record.json === true,
  };
}
