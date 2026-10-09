import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config } from './config.js';
import { resolveStep, type ResolvedStep, type Registry } from './expand.js';
import { LineSplitter, type EventKind, type LogEvent } from './events.js';
import { parseJsonLog } from './jsonLog.js';
import { parseEnvelope } from './envelope.js';
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

function attachOutput(
  child: ChildProcess,
  step: ResolvedStep,
  sink: Sink,
  onNestedBoot?: () => void,
): void {
  const wire = (readable: Readable | null, stream: 'stdout' | 'stderr') => {
    if (!readable) return;
    const splitter = new LineSplitter();
    const emit = (line: string) => {
      // a nested harness emits envelopes — unwrap them so the child's step
      // names compose with ours (userapi/start) and json records survive
      const wrapped = parseEnvelope(line);
      if (wrapped) {
        const event: LogEvent = {
          step: `${step.name}/${wrapped.step}`,
          stream: wrapped.stream,
          line: wrapped.line,
          ts: wrapped.ts,
        };
        if (wrapped.json) {
          const json = parseJsonLog(wrapped.line);
          if (json) event.json = json;
        }
        if (wrapped.kind) event.kind = wrapped.kind;
        sink.event(event);
        if (wrapped.kind === 'boot' && wrapped.step === 'stepwyre') onNestedBoot?.();
        return;
      }
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

const exitOf = (code: number | null, signal: NodeJS.Signals | null) => signal ?? code;

function probeOnce(
  script: string,
  env: Record<string, string>,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', script], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (err) => resolve({ ok: false, stderr: err.message }));
    child.once('exit', (code) => resolve({ ok: code === 0, stderr }));
  });
}

export async function runHarness(config: Config, sink: Sink): Promise<number> {
  let env = initialEnv();
  // steps never get a TTY, so tell tools (pnpm, npm, ...) not to prompt
  env.CI ??= 'true';
  // a nested harness detects this and emits NDJSON envelopes instead of
  // human output, so step names and json records survive the pipe
  env.LOGS_JSON ??= '1';
  const registry: Registry = {};
  const keepalive: ChildProcess[] = [];
  let tearingDown = false;
  let current: ChildProcess | undefined;
  let terminating = false;
  let exitCode = 0;
  let stop!: () => void;
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });

  const system = (line: string, kind?: EventKind) => {
    const event: LogEvent = { step: 'stepwyre', stream: 'system', line, ts: Date.now() };
    if (kind) event.kind = kind;
    sink.event(event);
  };

  const teardown = () => {
    tearingDown = true;
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

  const finish = (code: number) => {
    if (terminating) return;
    terminating = true;
    exitCode = code;
    teardown();
    stop();
  };

  process.once('SIGINT', () => finish(130));
  process.once('SIGTERM', () => finish(143));

  const awaitReady = async (step: ResolvedStep, nestedBoot: Promise<void>) => {
    const ready = step.ready;
    if (!ready) return;
    if ('nested' in ready) {
      await Promise.race([nestedBoot, stopped]);
      return;
    }
    const deadline = Date.now() + ready.timeout * 1000;
    while (!terminating) {
      const result = await probeOnce(ready.script, env);
      if (result.ok) return;
      if (Date.now() >= deadline) {
        const detail = result.stderr.trim().split('\n').pop();
        if (detail) system(`ready probe for ${step.name}: ${detail}`);
        throw new Error(`keepalive ${step.name} not ready after ${ready.timeout}s`);
      }
      await Promise.race([delay(ready.interval * 1000), stopped]);
    }
  };

  try {
    for (const step of config.boot) {
      if (terminating) break;
      const resolved = await resolveStep(step, registry, env);
      registry[resolved.name] = resolved.props;

      if (resolved.lifecycle === 'keepalive') {
        const child = spawn('bash', ['-c', resolved.script], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
        let bootSeen!: () => void;
        const nestedBoot = new Promise<void>((resolve) => {
          bootSeen = resolve;
        });
        attachOutput(child, resolved, sink, bootSeen);
        child.once('exit', (code, exitSignal) => {
          if (tearingDown) return;
          system(`keepalive ${resolved.name} exited (${exitOf(code, exitSignal)})`);
          finish(code === 0 ? 0 : 1);
        });
        child.once('error', (err) => {
          system(`keepalive ${resolved.name} failed to start: ${err.message}`);
          finish(1);
        });
        keepalive.push(child);
        system(`keepalive ${resolved.name} started`);
        await awaitReady(resolved, nestedBoot);
        if (terminating) break;
        if (resolved.ready) system(`keepalive ${resolved.name} ready`, 'ready');
        continue;
      }

      // capture the script's exit code before the env dump so a failing
      // last command still fails the step; the variable is unexported and
      // stays out of the captured env
      const child = spawn(
        'bash',
        ['-c', resolved.script + '\n__harness_exit=$?\nenv -0 >&3\nexit $__harness_exit'],
        {
          env,
          stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
          detached: true,
        },
      );
      current = child;
      attachOutput(child, resolved, sink);
      const fd3 = child.stdio[3];
      const envPipe = fd3 instanceof Readable ? fd3 : null;
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
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', (err) => {
          reject(new Error(`step ${resolved.name} failed to start: ${err.message}`));
        });
      });
      current = undefined;
      if (terminating) break;
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
    if (!terminating) {
      system('boot complete', 'boot');
      // the run lives while its services do; a signal or a dying keepalive ends it
      if (keepalive.length > 0) await stopped;
    }
  } finally {
    teardown();
  }
  return exitCode;
}
