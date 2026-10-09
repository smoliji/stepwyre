import React, { useEffect, useMemo, useRef, useState } from 'react';
import process from 'node:process';
import { Box, Text, render, useInput, useStdout } from 'ink';
import { runDetail } from '../banner.js';
import type { LogEvent } from '../events.js';
import type { Sink } from '../sink.js';
import { stepColor } from '../log.js';
import { layout, type ViewEntry } from './layout.js';
import { appendCapped, pruneExpanded } from './buffer.js';
import { clamp, scrollBy, type ScrollState } from './scroll.js';
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouse } from './mouse.js';
import { dumpLines, expandMarker } from './dump.js';

const BUFFER_CAP = 10000;
const FLUSH_MS = 50;
const HEADER_ROWS = 1;
const COPPER = '#E68A4D';

export interface RunMeta {
  stepCount: number;
  paths: string[];
}

interface Feed {
  deliver?: (events: LogEvent[]) => void;
  backlog: LogEvent[];
  lastFrame?: string[];
}

function toEntry(event: LogEvent, id: number): ViewEntry {
  return { id, step: event.step, stream: event.stream, raw: event.line, json: event.json };
}

function App({ feed, meta }: { feed: Feed; meta: RunMeta }) {
  const { stdout } = useStdout();
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [scroll, setScroll] = useState<ScrollState>({ scrollTop: 0, follow: true });
  // some ptys report a 0×0 winsize — a collapsed box would paint nothing
  const measure = () => ({ width: stdout.columns || 80, height: stdout.rows || 24 });
  const [size, setSize] = useState(measure);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(1);
  const pending = useRef<LogEvent[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const viewHeight = Math.max(1, size.height - HEADER_ROWS - (paused ? 1 : 0));
  const rows = useMemo(
    () => layout(entries, expanded, size.width),
    [entries, expanded, size.width],
  );
  const view = clamp(scroll, rows.length, viewHeight);
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const snapshot = {
    rows,
    scrollTop: view.scrollTop,
    byId,
    height: viewHeight,
    width: size.width,
    expanded,
    paused,
  };
  const live = useRef(snapshot);
  live.current = snapshot;

  useEffect(() => {
    feed.deliver = (events) => {
      pending.current.push(...events);
      if (pending.current.length > BUFFER_CAP) {
        pending.current.splice(0, pending.current.length - BUFFER_CAP);
      }
    };
    feed.deliver(feed.backlog.splice(0));
    const timer = setInterval(() => {
      if (pending.current.length === 0 || live.current.paused) return;
      const fresh = pending.current.splice(0).map((event) => toEntry(event, nextId.current++));
      const { next, dropped } = appendCapped(entriesRef.current, fresh, BUFFER_CAP);
      entriesRef.current = next;
      setEntries(next);

      if (dropped.length === 0) return;
      const droppedIds = new Set(dropped.map((entry) => entry.id));
      const expandedAtDrop = live.current.expanded;
      setExpanded((current) => pruneExpanded(current, droppedIds));
      const droppedRows = layout(dropped, expandedAtDrop, live.current.width).length;
      setScroll((current) =>
        current.follow
          ? current
          : { scrollTop: Math.max(0, current.scrollTop - droppedRows), follow: false },
      );
    }, FLUSH_MS);
    return () => clearInterval(timer);
  }, [feed]);

  useEffect(() => {
    const onResize = () => setSize(measure());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  useEffect(() => {
    process.stdout.write(paused ? MOUSE_DISABLE : MOUSE_ENABLE);
  }, [paused]);

  useEffect(() => {
    process.stdout.write(MOUSE_ENABLE);
    const onData = (chunk: Buffer | string) => {
      if (live.current.paused) return;
      for (const action of parseMouse(String(chunk))) {
        if (action.kind === 'wheel') {
          setScroll((current) =>
            scrollBy(current, action.delta, live.current.rows.length, live.current.height),
          );
          continue;
        }
        if (action.y < HEADER_ROWS) continue;
        const row = live.current.rows[live.current.scrollTop + action.y - HEADER_ROWS];
        const entry = row && live.current.byId.get(row.entryId);
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
  }, []);

  useInput((input, key) => {
    // SGR mouse reports leak through ink's input stream — the raw stdin listener parses them; ink must not treat them as keys
    if (input.includes('[<')) return;
    if (key.ctrl && input === 'c') {
      process.kill(process.pid, 'SIGINT');
      return;
    }
    const page = Math.max(1, viewHeight - 1);
    if (input === ' ') setPaused((current) => !current);
    else if (key.upArrow) setScroll((current) => scrollBy(current, -1, rows.length, viewHeight));
    else if (key.downArrow) setScroll((current) => scrollBy(current, 1, rows.length, viewHeight));
    else if (key.pageUp) setScroll((current) => scrollBy(current, -page, rows.length, viewHeight));
    else if (key.pageDown) setScroll((current) => scrollBy(current, page, rows.length, viewHeight));
    else if (input === 'g' || key.home) setScroll({ scrollTop: 0, follow: false });
    else if (input === 'G' || key.end)
      setScroll({ scrollTop: Number.MAX_SAFE_INTEGER, follow: true });
  });

  const pad = useMemo(
    () => Math.max(7, ...entries.map((entry) => entry.step.length)) + 2,
    [entries],
  );
  const visible = rows.slice(view.scrollTop, view.scrollTop + viewHeight);
  feed.lastFrame = dumpLines(visible, byId, expanded, pad);

  return (
    <Box flexDirection="column" width={size.width} height={size.height}>
      <Text wrap="truncate">
        <Text color={COPPER}>{'▂▄▆ '}</Text>
        <Text bold>stepwyre</Text>
        <Text dimColor>{runDetail(meta.stepCount, meta.paths)}</Text>
      </Text>
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
          severity === 'error'
            ? 'red'
            : severity === 'warn'
              ? 'yellow'
              : entry.stream === 'stderr' && !entry.json
                ? 'red'
                : undefined;
        const arrow = expandMarker(entry, expanded);
        return (
          <Text key={index} wrap="truncate">
            <Text color={stepColor(entry.step)}>{entry.step.padEnd(pad)}</Text>
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
      {paused && (
        <Text dimColor inverse wrap="truncate">
          {' ⏸ paused — space resumes, mouse selection works normally '}
        </Text>
      )}
    </Box>
  );
}

export function createInkSink(meta: RunMeta): Sink {
  const feed: Feed = { backlog: [] };
  const instance = render(<App feed={feed} meta={meta} />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  let closing: Promise<void> | undefined;
  return {
    event(event: LogEvent): void {
      if (feed.deliver) feed.deliver([event]);
      else feed.backlog.push(event);
    },
    close(): Promise<void> {
      return (closing ??= (async () => {
        process.stdout.write(MOUSE_DISABLE);
        instance.unmount();
        await instance.waitUntilExit();
        if (feed.lastFrame && feed.lastFrame.length > 0) {
          process.stderr.write(feed.lastFrame.join('\n') + '\n');
        }
      })());
    },
  };
}
