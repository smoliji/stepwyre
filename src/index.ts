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
import { findRun, listRuns, register, unregister } from './registry.js';
import { followLog } from './view.js';
import { resolve } from 'node:path';

const USAGE = [
  'usage: stepwyre [--json] [--state <file>] [--log <file>] <config.yaml> [config2.yaml ...]',
  '       stepwyre view [<log.ndjson> | <pid>]',
].join('\n');

async function view(target: string | undefined): Promise<void> {
  if (target === undefined) {
    const runs = listRuns();
    if (runs.length === 0) console.error('no live runs with --log or --state');
    for (const run of runs) {
      console.log(
        `${run.pid}\t${new Date(run.started).toISOString()}\t${run.configs.join(' ')}\t${run.log ?? '-'}`,
      );
    }
    return;
  }
  let path = target;
  let pid: number | undefined;
  if (/^\d+$/.test(target)) {
    const run = findRun(Number(target));
    if (!run) throw new Error(`no live run with pid ${target}`);
    if (!run.log) throw new Error(`run ${target} has no --log file to follow`);
    path = run.log;
    pid = run.pid;
  } else {
    pid = listRuns().find((run) => run.log === resolve(target))?.pid;
  }
  const tty = process.stdout.isTTY && process.stdin.isTTY;
  const sink: Sink = tty ? createInkSink({ paths: [path], pid, view: true }) : new StreamSink([]);
  const stop = new Promise<void>((done) => {
    process.once('SIGINT', () => done());
    process.once('SIGTERM', () => done());
  });
  await followLog(path, sink, stop);
  if (tty) await stop; // keep the final screen until Ctrl+C
  await sink.close();
}

if (process.argv[2] === 'view') {
  view(process.argv[3])
    .then(() => process.exit(0))
    .catch((err) => {
      logError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  await new Promise(() => {});
}

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
  if (logPath || statePath) {
    register({
      pid: process.pid,
      configs: paths,
      started: Date.now(),
      ...(logPath ? { log: resolve(logPath) } : {}),
      ...(statePath ? { state: resolve(statePath) } : {}),
    });
    process.on('exit', () => unregister(process.pid));
  }
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
