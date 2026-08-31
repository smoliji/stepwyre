import process from 'node:process';
import { styleText } from 'node:util';
import { colorEnabled } from './log.js';

// brand copper is not in styleText's named palette — 256-color 208 is the closest
const copper = (text: string): string => `\x1b[38;5;208m${text}\x1b[39m`;

export function renderBanner(stepCount: number, paths: string[], colored: boolean): string {
  const steps = `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`;
  const detail = ` · ${steps} · ${paths.join(' ')}`;
  const stair = ['        ┌────●', '   ┌────┘', '●──┘'];
  const name = colored ? styleText('bold', 'stepwyre') : 'stepwyre';
  const info = colored ? `${name}${styleText('dim', detail)}` : `${name}${detail}`;
  const mark = colored ? stair.map((line) => copper(line)) : stair;
  return `\n${mark[0]}\n${mark[1]}      ${info}\n${mark[2]}\n\n`;
}

export function printBanner(
  stepCount: number,
  paths: string[],
  err: NodeJS.WritableStream & { isTTY?: boolean } = process.stderr,
): void {
  err.write(renderBanner(stepCount, paths, colorEnabled(err)));
}
