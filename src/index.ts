#!/usr/bin/env node
import { loadConfigs } from './config.js';
import { runHarness } from './runner.js';
import { logError } from './log.js';

const configPaths = process.argv.slice(2);

if (configPaths.length === 0) {
  console.error('usage: harness <config.yaml> [config2.yaml ...]');
  process.exit(1);
}

async function main(paths: string[]): Promise<void> {
  await runHarness(loadConfigs(paths));
}

main(configPaths).catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
