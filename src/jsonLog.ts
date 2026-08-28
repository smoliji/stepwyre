export type Severity = 'info' | 'warn' | 'error';

export interface JsonLog {
  message: string;
  severity: Severity;
  pretty: string;
}

function severityOf(level: unknown): Severity {
  if (typeof level === 'number') {
    if (level >= 50) return 'error';
    if (level >= 40) return 'warn';
    return 'info';
  }
  if (level === 'error' || level === 'fatal') return 'error';
  if (level === 'warn' || level === 'warning') return 'warn';
  return 'info';
}

export function parseJsonLog(line: string): JsonLog | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const message =
    typeof record.msg === 'string'
      ? record.msg
      : typeof record.message === 'string'
        ? record.message
        : JSON.stringify(value);
  return { message, severity: severityOf(record.level), pretty: JSON.stringify(value, null, 2) };
}
