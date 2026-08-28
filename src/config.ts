import { readFileSync } from 'node:fs';
import { parseYaml } from './yaml.js';

export type Lifecycle = 'oneoff' | 'keepalive';

export interface BootStep {
  name: string;
  script: string;
  lifecycle: Lifecycle;
  [key: string]: unknown;
}

export interface Config {
  boot: BootStep[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

    if (item.lifecycle === undefined) {
      item.lifecycle = 'oneoff';
    }

    if (item.lifecycle !== 'oneoff' && item.lifecycle !== 'keepalive') {
      throw new Error(
        `boot step '${name}' (${index}) has invalid lifecycle '${String(item.lifecycle)}'`,
      );
    }

    return item as BootStep;
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
