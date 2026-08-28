import type { JsonLog } from '../jsonLog.js';

export interface ViewEntry {
  id: number;
  step: string;
  stream: 'stdout' | 'stderr' | 'system';
  raw: string;
  json?: JsonLog;
}

export interface DisplayRow {
  entryId: number;
  kind: 'head' | 'body';
  text: string;
}

export const BODY_INDENT = 4;

const ansiPattern = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export function stripAnsi(text: string): string {
  return text.replaceAll(ansiPattern, '');
}

function chunk(line: string, size: number): string[] {
  if (line === '') return [''];
  const parts: string[] = [];
  for (let cursor = 0; cursor < line.length; cursor += size) {
    parts.push(line.slice(cursor, cursor + size));
  }
  return parts;
}

export function layout(
  entries: ViewEntry[],
  expanded: ReadonlySet<number>,
  width: number,
): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const bodyWidth = Math.max(1, width - BODY_INDENT);
  const indent = ' '.repeat(BODY_INDENT);
  for (const entry of entries) {
    rows.push({
      entryId: entry.id,
      kind: 'head',
      text: entry.json ? entry.json.message : stripAnsi(entry.raw),
    });
    if (entry.json && expanded.has(entry.id)) {
      for (const line of entry.json.pretty.split('\n')) {
        for (const part of chunk(line, bodyWidth)) {
          rows.push({ entryId: entry.id, kind: 'body', text: indent + part });
        }
      }
    }
  }
  return rows;
}
