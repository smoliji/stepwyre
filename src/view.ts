import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnvelope, toEvent } from './envelope.js';
import { LineSplitter } from './events.js';
import type { Sink } from './sink.js';

const POLL_MS = 200;

/**
 * Replays an NDJSON log into a sink and keeps following it, like tail -f,
 * until the run's `end` event or until `stop` settles.
 */
export async function followLog(path: string, sink: Sink, stop: Promise<void>): Promise<void> {
  const splitter = new LineSplitter();
  let position = 0;
  let ended = false;
  let stopped = false;
  void stop.then(() => {
    stopped = true;
  });

  const consume = (line: string) => {
    const wrapped = parseEnvelope(line);
    if (!wrapped) return;
    sink.event(toEvent(wrapped));
    if (wrapped.kind === 'end' && wrapped.step === 'stepwyre') ended = true;
  };

  while (!stopped && !ended) {
    const size = statSync(path).size;
    if (size < position) position = 0; // truncated and rewritten
    if (size > position) {
      const fd = openSync(path, 'r');
      try {
        const buffer = Buffer.alloc(size - position);
        const read = readSync(fd, buffer, 0, buffer.length, position);
        position += read;
        for (const line of splitter.push(buffer.toString('utf8', 0, read))) consume(line);
      } finally {
        closeSync(fd);
      }
      continue;
    }
    await Promise.race([delay(POLL_MS), stop]);
  }
  for (const line of splitter.flush()) consume(line);
}
