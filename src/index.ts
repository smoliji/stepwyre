#!/usr/bin/env node
import process from 'node:process';
import { loadConfigs } from './config.js';
import { runHarness } from './runner.js';
import { printBanner } from './banner.js';
import { logError } from './log.js';
import { StreamSink, type Sink } from './sink.js';
import { JsonSink } from './jsonSink.js';
import { createInkSink } from './viewer/app.js';

const args = process.argv.slice(2);
const jsonMode =
  args.includes('--json') || (process.env.LOGS_JSON !== undefined && process.env.LOGS_JSON !== '');
const configPaths = args.filter((arg) => arg !== '--json');

if (configPaths.length === 0) {
  console.error('usage: stepwyre [--json] <config.yaml> [config2.yaml ...]');
  process.exit(1);
}

async function main(paths: string[]): Promise<void> {
  const config = loadConfigs(paths);
  if (!jsonMode) printBanner(config.boot.length, paths);
  const sink: Sink = jsonMode
    ? new JsonSink()
    : process.stdout.isTTY && process.stdin.isTTY
      ? createInkSink({ stepCount: config.boot.length, paths })
      : new StreamSink(config.boot.map((step) => step.name));
  try {
    await runHarness(config, sink);
    await sink.close();
  } catch (err) {
    await sink.close();
    throw err;
  }
}

main(configPaths).catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
