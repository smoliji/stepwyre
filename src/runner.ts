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
        if (wrapped.subject !== undefined) event.subject = `${step.name}/${wrapped.subject}`;
        if (wrapped.props) event.props = wrapped.props;
        if (wrapped.code !== undefined) event.code = wrapped.code;
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

const unref = { ref: false };

interface Tracked {
  name: string;
  child: ChildProcess;
  stopTimeout: number;
  exited: Promise<void>;
}

function track(name: string, child: ChildProcess, stopTimeout: number): Tracked {
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
  return { name, child, stopTimeout, exited };
}

const alive = ({ child }: Tracked) =>
  child.pid !== undefined && child.exitCode === null && child.signalCode === null;

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {}
}

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
  const keepalive: Tracked[] = [];
  let tearingDown = false;
  let current: Tracked | undefined;
  let terminating = false;
  let teardownDone: Promise<void> | undefined;
  let exitCode = 0;
  let stop!: () => void;
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });

  const system = (
    line: string,
    kind?: EventKind,
    detail: Omit<LogEvent, 'step' | 'stream' | 'line' | 'ts' | 'kind'> = {},
  ) => {
    const event: LogEvent = { step: 'stepwyre', stream: 'system', line, ts: Date.now(), ...detail };
    if (kind) event.kind = kind;
    sink.event(event);
  };

  const started = (step: ResolvedStep) => {
    const { script: _script, ...props } = step.props;
    system(`${step.lifecycle} ${step.name} started`, 'step', { subject: step.name, props });
  };

  const fail = (message: string, subject?: string) => {
    system(message, 'failed', subject === undefined ? {} : { subject });
    finish(1);
  };

  const stopOne = async (tracked: Tracked) => {
    signalGroup(tracked.child, 'SIGTERM');
    const expired = delay(tracked.stopTimeout * 1000, 'expired', unref);
    if ((await Promise.race([tracked.exited, expired])) === 'expired') {
      signalGroup(tracked.child, 'SIGKILL');
      system(`killed ${tracked.name} after ${tracked.stopTimeout}s`);
      await tracked.exited;
    }
  };

  // SIGTERM every live child at once, then wait for them with their own grace
  const teardown = () => {
    if (teardownDone) return teardownDone;
    tearingDown = true;
    const live = [...keepalive, ...(current ? [current] : [])].filter(alive);
    teardownDone = (async () => {
      if (live.length === 0) return;
      system(`stopping ${live.length} step${live.length === 1 ? '' : 's'}`, 'stop');
      await Promise.all(live.map(stopOne));
      system('teardown complete');
    })();
    return teardownDone;
  };

  const killAll = () => {
    for (const tracked of [...keepalive, ...(current ? [current] : [])]) {
      signalGroup(tracked.child, 'SIGKILL');
    }
  };

  const finish = (code: number) => {
    if (terminating) return;
    terminating = true;
    exitCode = code;
    void teardown();
    stop();
  };

  const onSignal = (code: number) => {
    if (terminating) {
      // a second signal means the user is done waiting
      killAll();
      void sink.close().then(() => process.exit(exitCode));
      return;
    }
    finish(code);
  };

  process.on('SIGINT', () => onSignal(130));
  process.on('SIGTERM', () => onSignal(143));

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
        fail(`keepalive ${step.name} not ready after ${ready.timeout}s`, step.name);
        return;
      }
      await Promise.race([delay(ready.interval * 1000, undefined, unref), stopped]);
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
          const exit = exitOf(code, exitSignal);
          system(`keepalive ${resolved.name} exited (${exit})`, 'exited', {
            subject: resolved.name,
            code: exit,
          });
          if (!tearingDown) finish(code === 0 ? 0 : 1);
        });
        child.once('error', (err) => {
          if (tearingDown) return;
          fail(`keepalive ${resolved.name} failed to start: ${err.message}`, resolved.name);
        });
        keepalive.push(track(resolved.name, child, resolved.stopTimeout));
        started(resolved);
        await awaitReady(resolved, nestedBoot);
        if (terminating) break;
        if (resolved.ready) {
          system(`keepalive ${resolved.name} ready`, 'ready', { subject: resolved.name });
        }
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
      current = track(resolved.name, child, resolved.stopTimeout);
      attachOutput(child, resolved, sink);
      started(resolved);
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
      const code = await new Promise<number | null | Error>((resolve) => {
        child.once('exit', resolve);
        child.once('error', resolve);
      });
      current = undefined;
      if (terminating) break;
      if (code instanceof Error) {
        fail(`step ${resolved.name} failed to start: ${code.message}`, resolved.name);
        break;
      }
      await Promise.race([pipeDone, delay(200)]);
      envPipe?.destroy();
      const dump = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) {
        fail(`step ${resolved.name} failed with code ${code}`, resolved.name);
        break;
      }
      const captured = parseEnvDump(dump);
      if (Object.keys(captured).length > 0) env = captured;
      system(`oneoff ${resolved.name} done`, 'done', { subject: resolved.name });
    }
    if (!terminating) {
      system('boot complete', 'boot');
      // the run lives while its services do; a signal or a dying keepalive ends it
      if (keepalive.length > 0) await stopped;
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    await teardown();
    system(`run ended (${exitCode})`, 'end', { code: exitCode });
  }
  return exitCode;
}
