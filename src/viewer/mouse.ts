export const MOUSE_ENABLE = '\x1b[?1002;1006h';
export const MOUSE_DISABLE = '\x1b[?1002;1006l';

export type MouseAction =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'wheel'; delta: number };

const sgrPattern = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

export function parseMouse(chunk: string): MouseAction[] {
  const actions: MouseAction[] = [];
  for (const match of chunk.matchAll(sgrPattern)) {
    const button = Number(match[1]);
    const x = Number(match[2]) - 1;
    const y = Number(match[3]) - 1;
    const press = match[4] === 'M';
    if (button === 0 && press) actions.push({ kind: 'click', x, y });
    else if (button === 64 && press) actions.push({ kind: 'wheel', delta: -3 });
    else if (button === 65 && press) actions.push({ kind: 'wheel', delta: 3 });
  }
  return actions;
}
