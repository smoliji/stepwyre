import { styleText } from 'node:util';
import process from 'node:process';

export type Format = Parameters<typeof styleText>[0];

const enabled =
  process.env.NO_COLOR === undefined &&
  (process.env.FORCE_COLOR !== undefined || process.stderr.isTTY === true);

export const paint = (format: Format, text: string): string =>
  enabled ? styleText(format, text) : text;

const palette: Format[] = ['cyan', 'magenta', 'green', 'yellow', 'blue', 'red'];

export function stepColor(step: string): Format {
  let hash = 0;
  for (const char of step) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return palette[hash % palette.length]!;
}

export function logError(message: string): void {
  process.stderr.write(`${paint('dim', '[harness]')} ${paint('red', message)}\n`);
}
