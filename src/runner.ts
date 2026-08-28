import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import type { Readable } from 'node:stream';
import type { Config } from './config.js';
import { resolveStep, type Registry } from './expand.js';
import { logStep } from './log.js';

function initialEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function parseEnvDump(dump: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of dump.split('\0')) {
    const eq = entry.indexOf('=');
    if (eq === -1) continue;
    env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return env;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runHarness(config: Config): Promise<void> {
  let env = initialEnv();
  const registry: Registry = {};
  const keepalive: ChildProcess[] = [];

  const teardown = () => {
    for (const child of keepalive) {
      if (child.pid === undefined) continue;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
  };

  process.once('SIGINT', () => {
    teardown();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    teardown();
    process.exit(143);
  });

  try {
    for (const step of config.boot) {
      const resolved = await resolveStep(step, registry, env);
      registry[resolved.name] = resolved.props;

      if (resolved.lifecycle === 'keepalive') {
        const child = spawn('bash', ['-c', resolved.script], {
          env,
          stdio: 'inherit',
          detached: true,
        });
        keepalive.push(child);
        logStep('keepalive', resolved.name, 'started');
        continue;
      }

      const child = spawn('bash', ['-c', resolved.script + '\nenv -0 >&3'], {
        env,
        stdio: ['inherit', 'inherit', 'inherit', 'pipe'],
      });
      const envPipe = child.stdio[3] as Readable | null;
      const chunks: Buffer[] = [];
      // a backgrounded grandchild can inherit fd 3 and keep the pipe open
      // past the step's exit, so never block on the pipe ending
      const pipeDone = envPipe
        ? new Promise<void>((resolve) => {
            envPipe.on('data', (chunk: Buffer) => chunks.push(chunk));
            envPipe.once('end', resolve);
            envPipe.once('error', resolve);
          })
        : Promise.resolve();
      const code = await new Promise<number | null>((resolve) => {
        child.once('exit', (exitCode) => resolve(exitCode));
      });
      await Promise.race([pipeDone, delay(200)]);
      envPipe?.destroy();
      const dump = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) {
        throw new Error(`step ${resolved.name} failed with code ${code}`);
      }
      const captured = parseEnvDump(dump);
      if (Object.keys(captured).length > 0) env = captured;
      logStep('oneoff', resolved.name, 'done');
    }
  } finally {
    teardown();
  }
}
