#!/usr/bin/env node
import process from 'node:process';
import { loadConfigs } from './config.js';
import { runHarness } from './runner.js';
import { printBanner } from './banner.js';
import { logError } from './log.js';
import { StreamSink, type Sink } from './sink.js';
import { JsonSink } from './jsonSink.js';
import { createInkSink } from './viewer/app.js';
import { StateSink, initialState } from './state.js';

const args = process.argv.slice(2);
const jsonMode =
  args.includes('--json') || (process.env.LOGS_JSON !== undefined && process.env.LOGS_JSON !== '');
const stateAt = args.indexOf('--state');
const statePath = stateAt === -1 ? undefined : args[stateAt + 1];
const configPaths = args.filter(
  (arg, index) =>
    arg !== '--json' && (stateAt === -1 || (index !== stateAt && index !== stateAt + 1)),
);

if (configPaths.length === 0 || (stateAt !== -1 && !statePath)) {
  console.error('usage: stepwyre [--json] [--state <file>] <config.yaml> [config2.yaml ...]');
  process.exit(1);
}

async function main(paths: string[]): Promise<void> {
  const config = loadConfigs(paths);
  if (!jsonMode) printBanner(config.boot.length, paths);
  const output: Sink = jsonMode
    ? new JsonSink()
    : process.stdout.isTTY && process.stdin.isTTY
      ? createInkSink({ stepCount: config.boot.length, paths })
      : new StreamSink(config.boot.map((step) => step.name));
  const sink = statePath ? new StateSink(output, statePath, initialState(paths)) : output;
  let code = 1;
  try {
    code = await runHarness(config, sink);
  } finally {
    await sink.close();
  }
  process.exit(code);
}

main(configPaths).catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
