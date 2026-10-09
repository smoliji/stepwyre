import { EVENT_KINDS, type EventKind, type LogEvent } from './events.js';
import { parseJsonLog, parseJsonObject } from './jsonLog.js';

const MARKER = '@log';

const isStream = (value: unknown): value is LogEvent['stream'] =>
  value === 'stdout' || value === 'stderr' || value === 'system';

const isKind = (value: unknown): value is EventKind =>
  typeof value === 'string' && EVENT_KINDS.has(value);

const isProps = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === 'string');

const isCode = (value: unknown): value is number | string | null =>
  value === null || typeof value === 'number' || typeof value === 'string';

export interface Envelope {
  step: string;
  stream: LogEvent['stream'];
  ts: number;
  line: string;
  json: boolean;
  kind?: EventKind;
  subject?: string;
  props?: Record<string, string>;
  code?: number | string | null;
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
    ...(event.subject !== undefined ? { subject: event.subject } : {}),
    ...(event.props ? { props: event.props } : {}),
    ...(event.code !== undefined ? { code: event.code } : {}),
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
  if (typeof record.subject === 'string') parsed.subject = record.subject;
  if (isProps(record.props)) parsed.props = record.props;
  if (isCode(record.code)) parsed.code = record.code;
  return parsed;
}

/** The event an envelope carried; `prefix` composes nested step names. */
export function toEvent(wrapped: Envelope, prefix?: string): LogEvent {
  const compose = (name: string) => (prefix ? `${prefix}/${name}` : name);
  const event: LogEvent = {
    step: compose(wrapped.step),
    stream: wrapped.stream,
    line: wrapped.line,
    ts: wrapped.ts,
  };
  if (wrapped.json) {
    const json = parseJsonLog(wrapped.line);
    if (json) event.json = json;
  }
  if (wrapped.kind) event.kind = wrapped.kind;
  if (wrapped.subject !== undefined) event.subject = compose(wrapped.subject);
  if (wrapped.props) event.props = wrapped.props;
  if (wrapped.code !== undefined) event.code = wrapped.code;
  return event;
}
