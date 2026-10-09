import { readFileSync } from 'node:fs';
import { parseYaml } from './yaml.js';

export type Lifecycle = 'oneoff' | 'keepalive';

export type Ready = { script: string; interval: number; timeout: number } | { nested: true };

export interface BootStep {
  name: string;
  script: string;
  lifecycle: Lifecycle;
  logs?: 'json';
  ready?: Ready;
  stop_timeout?: number;
  [key: string]: unknown;
}

export interface Config {
  boot: BootStep[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DEFAULT_READY_INTERVAL = 1;
const DEFAULT_READY_TIMEOUT = 60;
export const DEFAULT_STOP_TIMEOUT = 10;

function seconds(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'boolean' || value === '' || !(parsed > 0)) {
    throw new Error(`${label} must be a positive number of seconds`);
  }
  return parsed;
}

function parseReady(value: unknown, lifecycle: Lifecycle, label: string): Ready {
  if (lifecycle !== 'keepalive') {
    throw new Error(`${label} is only valid on a keepalive step`);
  }
  if (value === 'nested') return { nested: true };
  if (!isObject(value) || typeof value.script !== 'string') {
    throw new Error(`${label} must be 'nested' or a mapping with a string 'script'`);
  }
  return {
    script: value.script,
    interval: seconds(value.interval, DEFAULT_READY_INTERVAL, `${label}.interval`),
    timeout: seconds(value.timeout, DEFAULT_READY_TIMEOUT, `${label}.timeout`),
  };
}

export function loadConfig(path: string): Config {
  const root = parseYaml(readFileSync(path, 'utf8'));

  if (!isObject(root)) {
    throw new Error('config root must be a mapping');
  }

  const boot = root.boot;
  if (!Array.isArray(boot)) {
    throw new Error("config must have an array property 'boot'");
  }

  const steps: BootStep[] = boot.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`boot step ${index} must be a mapping`);
    }

    if (typeof item.name !== 'string') {
      throw new Error(`boot step ${index} must have a string 'name'`);
    }
    const name = item.name;

    if (typeof item.script !== 'string') {
      throw new Error(`boot step '${name}' (${index}) must have a string 'script'`);
    }

    const lifecycle = item.lifecycle ?? 'oneoff';
    if (lifecycle !== 'oneoff' && lifecycle !== 'keepalive') {
      throw new Error(
        `boot step '${name}' (${index}) has invalid lifecycle '${String(lifecycle)}'`,
      );
    }

    if (item.logs !== undefined && item.logs !== 'json') {
      throw new Error(`boot step '${name}' (${index}) has invalid logs '${String(item.logs)}'`);
    }

    const step = { ...item, lifecycle } as BootStep;
    if (item.ready !== undefined) {
      step.ready = parseReady(item.ready, lifecycle, `boot step '${name}' (${index}) ready`);
    }
    if (item.stop_timeout !== undefined) {
      const label = `boot step '${name}' (${index}) stop_timeout`;
      if (lifecycle !== 'keepalive') throw new Error(`${label} is only valid on a keepalive step`);
      step.stop_timeout = seconds(item.stop_timeout, DEFAULT_STOP_TIMEOUT, label);
    }
    return step;
  });

  return { boot: steps };
}

export function loadConfigs(paths: string[]): Config {
  const steps = paths.flatMap((path) => loadConfig(path).boot);
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.name)) {
      throw new Error(`duplicate step name '${step.name}'`);
    }
    seen.add(step.name);
  }
  return { boot: steps };
}
