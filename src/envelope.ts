import type { EventKind, LogEvent } from './events.js';
import { parseJsonObject } from './jsonLog.js';

const MARKER = '@log';

const isStream = (value: unknown): value is LogEvent['stream'] =>
  value === 'stdout' || value === 'stderr' || value === 'system';

const isKind = (value: unknown): value is EventKind => value === 'ready' || value === 'boot';

export interface Envelope {
  step: string;
  stream: LogEvent['stream'];
  ts: number;
  line: string;
  json: boolean;
  kind?: EventKind;
}

export function envelope(event: LogEvent): string {
  return JSON.stringify({
    [MARKER]: 1,
    step: event.step,
    stream: event.stream,
    ts: event.ts,
    line: event.line,
    json: event.json !== undefined,
    ...(event.kind ? { kind: event.kind } : {}),
  });
}

export function parseEnvelope(line: string): Envelope | undefined {
  const record = parseJsonObject(line);
  if (!record) return undefined;
  if (record[MARKER] !== 1) return undefined;
  if (typeof record.step !== 'string') return undefined;
  if (!isStream(record.stream)) return undefined;
  if (typeof record.line !== 'string') return undefined;
  const parsed: Envelope = {
    step: record.step,
    stream: record.stream,
    ts: typeof record.ts === 'number' ? record.ts : Date.now(),
    line: record.line,
    json: record.json === true,
  };
  if (isKind(record.kind)) parsed.kind = record.kind;
  return parsed;
}
