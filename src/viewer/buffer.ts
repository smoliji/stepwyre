import type { ViewEntry } from './layout.js';

export function appendCapped(
  existing: readonly ViewEntry[],
  fresh: readonly ViewEntry[],
  cap: number,
): { next: ViewEntry[]; dropped: ViewEntry[] } {
  const merged = [...existing, ...fresh];
  if (merged.length <= cap) return { next: merged, dropped: [] };
  return { next: merged.slice(-cap), dropped: merged.slice(0, merged.length - cap) };
}

export function pruneExpanded(
  expanded: ReadonlySet<number>,
  droppedIds: ReadonlySet<number>,
): ReadonlySet<number> {
  const pruned = new Set([...expanded].filter((id) => !droppedIds.has(id)));
  return pruned.size === expanded.size ? expanded : pruned;
}
