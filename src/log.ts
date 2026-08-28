import { styleText } from 'node:util';
import process from 'node:process';

type Format = Parameters<typeof styleText>[0];

const enabled =
  process.env.NO_COLOR === undefined &&
  (process.env.FORCE_COLOR !== undefined || process.stderr.isTTY === true);

const paint = (format: Format, text: string): string => (enabled ? styleText(format, text) : text);

const prefix = paint('dim', '[harness]');

const eventColor: Record<string, Format> = {
  keepalive: 'magenta',
  oneoff: 'cyan',
};

export function logStep(event: string, name: string, status: string): void {
  const tag = paint(eventColor[event] ?? 'blue', event);
  const label = paint('bold', name);
  const state = paint('green', status);
  process.stderr.write(`${prefix} ${tag} ${label} ${state}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`${prefix} ${paint('red', message)}\n`);
}
