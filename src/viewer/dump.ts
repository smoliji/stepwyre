import type { DisplayRow, ViewEntry } from './layout.js';

export function dumpLines(
  rows: DisplayRow[],
  byId: ReadonlyMap<number, ViewEntry>,
  expanded: ReadonlySet<number>,
  pad: number,
): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const entry = byId.get(row.entryId);
    if (!entry) continue;
    if (row.kind === 'body') {
      lines.push(row.text);
      continue;
    }
    const arrow = entry.json ? (expanded.has(entry.id) ? '▾ ' : '▸ ') : '';
    lines.push(entry.step.padEnd(pad) + arrow + row.text);
  }
  return lines;
}
