# node-harness

A minimal TypeScript harness that reads a YAML config and runs an ordered list of
boot steps. Each step runs a bash script; steps can allocate free TCP ports,
export environment into later steps, and stay alive in the background as long-running
services. Written against Node 24 with no runtime dependencies (Node builtins only).

## Install

```
pnpm install
```

## Build

```
pnpm build
```

Bundles `src/` into a single minified file `dist/harness.js` via esbuild. Type checking is
separate: `pnpm typecheck` runs `tsc --noEmit`. The bundle externalizes `ink` and `react`
dependencies, so `node_modules` must be present alongside the built file to run the harness.

## Run

```
node dist/harness.js examples/harness.yaml
node dist/harness.js infra.yaml app.yaml
```

Arguments are paths to YAML configs; their `boot` lists are concatenated in argument
order into one run (step names must be unique across all files, and `${ref.prop}`
references work across files). On SIGINT/SIGTERM — and on a failed step — the harness
tears down any keepalive children before exiting.

Progress lines go to stderr and are colored when it is a terminal. Set `NO_COLOR` to
disable colors or `FORCE_COLOR` to keep them when piping.

## Log viewer

When stdout and stdin are a terminal the harness runs a full-screen log viewer: every line
is prefixed with its step name, and steps marked `logs: json` render each JSON
line collapsed as `▸ <message>` (`msg` or `message` key; `level` colors the
row). Click a row to expand or collapse the full record; mouse wheel or arrow
keys scroll; scrolling up pauses auto-follow and scrolling back to the bottom
(or `G`) resumes it; `g` jumps to the top; Ctrl+C tears everything down.

Space pauses the viewer: rendering freezes and mouse reporting turns off, so
text can be selected and copied normally (no Shift needed); space again resumes
and buffered logs catch up. On exit the last visible screen — including any
expanded records — is printed to the normal terminal, so the final state
survives the alternate screen; nothing else is persisted.

When stdout or stdin is not a terminal (pipe, CI) the harness prints prefixed lines
instead, docker-compose style; JSON steps print just the message.

Step stdin is never connected to the terminal, so interactive child processes
are not supported; when debugging, use the VS Code Debug Console. To keep
tools like pnpm from waiting on prompts, steps run with `CI=true` unless the
caller already set `CI`. A oneoff step fails the boot as soon as its script's
last command exits non-zero — no explicit `exit` needed.

Try it: `node dist/harness.js examples/tui-demo.yaml`

## Config format

The config has a single `boot` key holding a sequence of steps run in order. Each step
is a mapping:

- `name` — required, unique. Later steps reference its props as `${name.prop}`.
- `script` — required. Runs under `bash -c`. Use a `|` block scalar for multi-line scripts.
- `lifecycle` — optional, `oneoff` (default) or `keepalive`.
  - `oneoff` runs to completion; any environment it exports flows into the following steps.
  - `keepalive` starts in the background and stays running; the harness kills it on teardown.
- Any other key (e.g. `port`) becomes a resolved prop on the step, referenceable later as `${name.port}`.

### `${...}` expansion

Values are expanded left to right, key by key, in insertion order:

- `${FREE_PORT}` — a fresh free TCP port, allocated per occurrence.
- `${REF.prop}` — a prop from an earlier step (cross-step reference).
- `${prop}` — a prop resolved earlier in the same step.
- `${ENV.NAME}` — an environment variable (sees `export`s from previous oneoff steps).
  Bash semantics: an unset variable is an empty string, never an error.
- `${A ?? B}` — fallback chain: the first defined, non-empty term wins. A chain where
  every term is empty (e.g. unset `ENV` vars) resolves to an empty string.
  Example: `port: ${ENV.SERVER_PORT ?? FREE_PORT}` makes a prop overridable from the shell.
- Literals: `'...'` or `"..."` is a string literal anywhere in a chain
  (`repo: ${ENV.SRC ?? '/path/with spaces'}`). An unquoted fallback term that addresses
  nothing known (no `ENV.`, no `FREE_PORT`, no known step ref, no prop) is taken verbatim —
  `${ENV.PG_HOST ?? localhost}` and `${ENV.PG_PORT ?? 5432}` work, while `${typo}` or an
  unknown `${step.prop}` reference still errors.

An unresolved `${...}` is an error. `${...}` is the harness expansion namespace, so inside
scripts reference shell environment with `$VAR`, not `${VAR}`.

See `examples/harness.yaml` for a self-contained config that exercises every feature and
then terminates.

## VS Code debugging

`examples/launch.json` contains a launch config that runs `dist/harness.js` against
`examples/harness.yaml` in the integrated terminal. Copy it to `.vscode/launch.json`
(or point your workspace at it) and run `pnpm build` first so `dist/harness.js` exists.
