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
import { LogFileSink, TeeSink } from './tee.js';

const USAGE =
  'usage: stepwyre [--json] [--state <file>] [--log <file>] <config.yaml> [config2.yaml ...]';

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  const paths: string[] = [];
  let json = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--state' || arg === '--log') {
      const value = args[++index];
      if (value === undefined) return undefined;
      options[arg.slice(2)] = value;
    } else {
      paths.push(arg);
    }
  }
  if (paths.length === 0) return undefined;
  return { json, paths, statePath: options.state, logPath: options.log };
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed) {
  console.error(USAGE);
  process.exit(1);
}
const { paths: configPaths, statePath, logPath } = parsed;
const jsonMode =
  parsed.json || (process.env.LOGS_JSON !== undefined && process.env.LOGS_JSON !== '');

async function main(paths: string[]): Promise<void> {
  const config = loadConfigs(paths);
  if (!jsonMode) printBanner(config.boot.length, paths);
  const output: Sink = jsonMode
    ? new JsonSink()
    : process.stdout.isTTY && process.stdin.isTTY
      ? createInkSink({ paths })
      : new StreamSink(config.boot.map((step) => step.name));
  const tee = logPath ? new TeeSink([output, new LogFileSink(logPath)]) : output;
  const sink = statePath ? new StateSink(tee, statePath, initialState(paths)) : tee;
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
