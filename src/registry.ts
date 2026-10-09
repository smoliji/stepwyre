import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

export interface RunRecord {
  pid: number;
  configs: string[];
  started: number;
  log?: string;
  state?: string;
}

/** one file per live run, so `stepwyre view <pid>` can find its log */
export const RUNS_DIR = process.env.STEPWYRE_RUNS ?? join(homedir(), '.stepwyre', 'runs');

const recordPath = (pid: number): string => join(RUNS_DIR, `${pid}.json`);

export function register(record: RunRecord): void {
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(recordPath(record.pid), JSON.stringify(record) + '\n');
}

export function unregister(pid: number): void {
  try {
    unlinkSync(recordPath(pid));
  } catch {
    // already gone
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** live runs; records of dead pids are dropped on the way */
export function listRuns(): RunRecord[] {
  let names: string[];
  try {
    names = readdirSync(RUNS_DIR);
  } catch {
    return [];
  }
  const runs: RunRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    let record: RunRecord;
    try {
      record = JSON.parse(readFileSync(join(RUNS_DIR, name), 'utf8')) as RunRecord;
    } catch {
      continue;
    }
    if (!alive(record.pid)) {
      unregister(record.pid);
      continue;
    }
    runs.push(record);
  }
  return runs.sort((a, b) => a.started - b.started);
}

export function findRun(pid: number): RunRecord | undefined {
  return listRuns().find((record) => record.pid === pid);
}
