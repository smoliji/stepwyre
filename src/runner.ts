import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import type { Readable } from 'node:stream';
import type { Config } from './config.js';
import { resolveStep, type ResolvedStep, type Registry } from './expand.js';
import { LineSplitter, type LogEvent } from './events.js';
import { parseJsonLog } from './jsonLog.js';
import type { Sink } from './sink.js';

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

function attachOutput(child: ChildProcess, step: ResolvedStep, sink: Sink): void {
  const wire = (readable: Readable | null, stream: 'stdout' | 'stderr') => {
    if (!readable) return;
    const splitter = new LineSplitter();
    const emit = (line: string) => {
      const event: LogEvent = { step: step.name, stream, line, ts: Date.now() };
      if (step.logs === 'json') {
        const json = parseJsonLog(line);
        if (json) event.json = json;
      }
      sink.event(event);
    };
    readable.setEncoding('utf8');
    readable.on('data', (chunk: string) => {
      for (const line of splitter.push(chunk)) emit(line);
    });
    readable.once('close', () => {
      for (const line of splitter.flush()) emit(line);
    });
  };
  wire(child.stdout, 'stdout');
  wire(child.stderr, 'stderr');
}

export async function runHarness(config: Config, sink: Sink): Promise<void> {
  let env = initialEnv();
  // steps never get a TTY, so tell tools (pnpm, npm, ...) not to prompt
  env.CI ??= 'true';
  const registry: Registry = {};
  const keepalive: ChildProcess[] = [];
  let current: ChildProcess | undefined;

  const system = (line: string) => {
    sink.event({ step: 'harness', stream: 'system', line, ts: Date.now() });
  };

  const teardown = () => {
    for (const child of keepalive) {
      if (child.pid === undefined) continue;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
    if (current?.pid !== undefined) {
      try {
        process.kill(-current.pid, 'SIGTERM');
      } catch {}
    }
  };

  const exitOnSignal = (code: number) => {
    teardown();
    void sink.close().then(() => process.exit(code));
  };

  process.once('SIGINT', () => exitOnSignal(130));
  process.once('SIGTERM', () => exitOnSignal(143));

  try {
    for (const step of config.boot) {
      const resolved = await resolveStep(step, registry, env);
      registry[resolved.name] = resolved.props;

      if (resolved.lifecycle === 'keepalive') {
        const child = spawn('bash', ['-c', resolved.script], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
        attachOutput(child, resolved, sink);
        keepalive.push(child);
        system(`keepalive ${resolved.name} started`);
        continue;
      }

      // capture the script's exit code before the env dump so a failing
      // last command still fails the step; the variable is unexported and
      // stays out of the captured env
      const child = spawn('bash', ['-c', resolved.script + '\n__harness_exit=$?\nenv -0 >&3\nexit $__harness_exit'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        detached: true,
      });
      current = child;
      attachOutput(child, resolved, sink);
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
      current = undefined;
      await Promise.race([pipeDone, delay(200)]);
      envPipe?.destroy();
      const dump = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) {
        throw new Error(`step ${resolved.name} failed with code ${code}`);
      }
      const captured = parseEnvDump(dump);
      if (Object.keys(captured).length > 0) env = captured;
      system(`oneoff ${resolved.name} done`);
    }
  } finally {
    teardown();
  }
}
