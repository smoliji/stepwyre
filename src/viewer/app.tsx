import React, { useEffect, useMemo, useRef, useState } from 'react';
import process from 'node:process';
import { Box, Text, render, useInput, useStdout } from 'ink';
import type { LogEvent } from '../events.js';
import type { Sink } from '../sink.js';
import { stepColor } from '../log.js';
import { layout, type ViewEntry } from './layout.js';
import { clamp, scrollBy, type ScrollState } from './scroll.js';
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouse } from './mouse.js';

const BUFFER_CAP = 10000;
const FLUSH_MS = 50;

interface Feed {
  deliver?: (events: LogEvent[]) => void;
  backlog: LogEvent[];
}

function toEntry(event: LogEvent, id: number): ViewEntry {
  return { id, step: event.step, stream: event.stream, raw: event.line, json: event.json };
}

function App({ feed }: { feed: Feed }) {
  const { stdout } = useStdout();
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [scroll, setScroll] = useState<ScrollState>({ scrollTop: 0, follow: true });
  const [size, setSize] = useState({ width: stdout.columns, height: stdout.rows });
  const nextId = useRef(1);
  const pending = useRef<LogEvent[]>([]);

  useEffect(() => {
    feed.deliver = (events) => pending.current.push(...events);
    feed.deliver(feed.backlog.splice(0));
    const timer = setInterval(() => {
      if (pending.current.length === 0) return;
      const fresh = pending.current.splice(0).map((event) => toEntry(event, nextId.current++));
      setEntries((current) => [...current, ...fresh].slice(-BUFFER_CAP));
    }, FLUSH_MS);
    return () => clearInterval(timer);
  }, [feed]);

  useEffect(() => {
    const onResize = () => setSize({ width: stdout.columns, height: stdout.rows });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const rows = useMemo(
    () => layout(entries, expanded, size.width),
    [entries, expanded, size.width],
  );
  const view = clamp(scroll, rows.length, size.height);

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);
    const onData = (chunk: Buffer | string) => {
      for (const action of parseMouse(String(chunk))) {
        if (action.kind === 'wheel') {
          setScroll((current) => scrollBy(current, action.delta, rows.length, size.height));
          continue;
        }
        const row = rows[view.scrollTop + action.y];
        const entry = row && entries.find((candidate) => candidate.id === row.entryId);
        if (entry?.json) {
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(entry.id)) next.delete(entry.id);
            else next.add(entry.id);
            return next;
          });
        }
      }
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
      process.stdout.write(MOUSE_DISABLE);
    };
  }, [rows, view.scrollTop, entries, size.height]);

  useInput((input, key) => {
    if (input.includes('[<')) return;
    if (key.ctrl && input === 'c') {
      process.kill(process.pid, 'SIGINT');
      return;
    }
    const page = Math.max(1, size.height - 1);
    if (key.upArrow) setScroll((current) => scrollBy(current, -1, rows.length, size.height));
    else if (key.downArrow) setScroll((current) => scrollBy(current, 1, rows.length, size.height));
    else if (key.pageUp) setScroll((current) => scrollBy(current, -page, rows.length, size.height));
    else if (key.pageDown) setScroll((current) => scrollBy(current, page, rows.length, size.height));
    else if (input === 'g') setScroll({ scrollTop: 0, follow: false });
    else if (input === 'G') setScroll({ scrollTop: Number.MAX_SAFE_INTEGER, follow: true });
  });

  const pad = useMemo(
    () => Math.max(7, ...entries.map((entry) => entry.step.length)) + 2,
    [entries],
  );
  const visible = rows.slice(view.scrollTop, view.scrollTop + size.height);
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  return (
    <Box flexDirection="column" width={size.width} height={size.height}>
      {visible.map((row, index) => {
        const entry = byId.get(row.entryId);
        if (!entry) return <Text key={index}> </Text>;
        if (row.kind === 'body') {
          return (
            <Text key={index} dimColor wrap="truncate">
              {row.text}
            </Text>
          );
        }
        const severity = entry.json?.severity;
        const color =
          severity === 'error' ? 'red' : severity === 'warn' ? 'yellow' : undefined;
        const arrow = entry.json ? (expanded.has(entry.id) ? '▾ ' : '▸ ') : '';
        return (
          <Text key={index} wrap="truncate">
            <Text color={stepColor(entry.step) as string}>{entry.step.padEnd(pad)}</Text>
            <Text
              color={color}
              dimColor={entry.stream === 'system' || (entry.stream === 'stderr' && !entry.json)}
            >
              {arrow}
              {row.text}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}

export function createInkSink(): Sink {
  const feed: Feed = { backlog: [] };
  const instance = render(<App feed={feed} />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  return {
    event(event: LogEvent): void {
      if (feed.deliver) feed.deliver([event]);
      else feed.backlog.push(event);
    },
    async close(): Promise<void> {
      process.stdout.write(MOUSE_DISABLE);
      instance.unmount();
      await instance.waitUntilExit();
    },
  };
}
