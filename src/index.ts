#!/usr/bin/env node
import process from 'node:process';
import { loadConfigs } from './config.js';
import { runHarness } from './runner.js';
import { logError } from './log.js';
import { StreamSink, type Sink } from './sink.js';
import { createInkSink } from './viewer/app.js';

const configPaths = process.argv.slice(2);

if (configPaths.length === 0) {
  console.error('usage: harness <config.yaml> [config2.yaml ...]');
  process.exit(1);
}

async function main(paths: string[]): Promise<void> {
  const config = loadConfigs(paths);
  const nested = process.env.NESTED !== undefined && process.env.NESTED !== '';
  const sink: Sink =
    process.stdout.isTTY && process.stdin.isTTY
      ? createInkSink()
      : new StreamSink(
          config.boot.map((step) => step.name),
          process.stdout,
          process.stderr,
          nested,
        );
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
