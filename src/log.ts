import { styleText } from 'node:util';
import process from 'node:process';

export type Format = Parameters<typeof styleText>[0];

export function colorEnabled(stream: { isTTY?: boolean }): boolean {
  return (
    process.env.NO_COLOR === undefined &&
    (process.env.FORCE_COLOR !== undefined || stream.isTTY === true)
  );
}

export const paint = (format: Format, text: string): string =>
  colorEnabled(process.stderr) ? styleText(format, text) : text;

const palette: Format[] = ['cyan', 'magenta', 'green', 'yellow', 'blue', 'red'];

export function stepColor(step: string): Format {
  let hash = 0;
  for (const char of step) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return palette[hash % palette.length]!;
}

export function logError(message: string): void {
  process.stderr.write(`${paint('dim', '[harness]')} ${paint('red', message)}\n`);
}
