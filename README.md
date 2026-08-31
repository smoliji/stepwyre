<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/lockup-dark.svg">
    <img src="brand/lockup-light.svg" alt="stepwyre" width="360">
  </picture>
</p>
<p align="center"><em>Wire your stack, step by step.</em></p>

stepwyre is a small boot orchestrator written in TypeScript. It reads a YAML config
and runs an ordered list of boot steps. Each step runs a bash script. A step can
allocate free TCP ports. A step can export environment variables to the steps that
follow. A step can stay alive in the background as a service. stepwyre runs on
Node 24 and uses only Node builtins at runtime.

## Install

```
pnpm install
```

## Build

```
pnpm build
```

The build bundles `src/` into one minified file, `dist/harness.js`, with esbuild.
Type checking is a separate step: `pnpm typecheck` runs `tsc --noEmit`. The bundle
keeps `ink` and `react` external. Keep `node_modules` next to the built file when
you run stepwyre.

## Run

```
node dist/harness.js examples/harness.yaml
node dist/harness.js infra.yaml app.yaml
```

Arguments are paths to YAML configs. stepwyre concatenates their `boot` lists in
argument order into one run. Step names must be unique across all files.
`${ref.prop}` references work across files. On SIGINT or SIGTERM, and after a
failed step, stepwyre stops all keepalive children before it exits.

Progress lines go to stderr. They are colored when stderr is a terminal. Set
`NO_COLOR` to disable colors. Set `FORCE_COLOR` to keep colors when you pipe the
output.

## Log viewer

When stdout and stdin are a terminal, stepwyre runs a full-screen log viewer. The
viewer prefixes each line with its step name. For steps marked `logs: json`, the
viewer collapses each JSON line to `▸ <message>`. The viewer reads the message from
the `msg` or `message` key. The `level` value sets the row color. Click a row to
expand or collapse the full record. Scroll with the mouse wheel or the arrow keys.
When you scroll up, auto-follow stops. Scroll to the bottom, or press `G`, to start
auto-follow again. Press `g` to jump to the top. Press Ctrl+C to stop all steps.

Press space to pause the viewer. The screen freezes and mouse reporting stops. You
can then select and copy text without the Shift key. Press space again to resume.
The viewer then shows the buffered logs. On exit, stepwyre prints the last visible
screen, with the expanded records, to the normal terminal. stepwyre does not
persist anything else.

When stdout or stdin is not a terminal (a pipe or CI), stepwyre prints prefixed
lines in the docker-compose style. For JSON steps it prints only the message.

`--json` switches to machine output. There is no viewer. stepwyre prints every
event to stdout as one NDJSON envelope `{"@log":1,"step":...,"stream":...,
"ts":...,"line":...,"json":true|false}`. The `json` field marks lines of
`logs: json` steps that parsed. This mode is useful for scripts and agents:
`stepwyre --json cfg.yaml | jq 'select(.json)'`.

Nested runs use the same protocol. Steps run with `LOGS_JSON=1` set. A nested
stepwyre then emits envelopes. The outer stepwyre unwraps them. Step names compose
(`userapi/start`). Streams and JSON records survive. The viewer shows nested steps
with their own prefixes and collapsible records. The step that runs the nested
stepwyre does not need `logs: json`.

Step stdin is not connected to the terminal. Interactive child processes are not
supported. Use the VS Code Debug Console when you debug. Steps run with `CI=true`
unless the caller sets `CI`. This prevents prompts from tools such as pnpm. A
oneoff step fails the boot when the last command of its script exits non-zero. You
do not need an explicit `exit`.

Try it: `node dist/harness.js examples/tui-demo.yaml`

## Config format

The config has one `boot` key. It holds a sequence of steps. stepwyre runs the
steps in order. Each step is a mapping:

- `name` is required and must be unique. Later steps reference its props as `${name.prop}`.
- `script` is required. It runs under `bash -c`. Use a `|` block scalar for multi-line scripts.
- `lifecycle` is optional. The values are `oneoff` (default) and `keepalive`.
  - A `oneoff` step runs to completion. The environment it exports flows into the steps that follow.
  - A `keepalive` step starts in the background and stays running. stepwyre stops it on teardown.
- Each other key (for example `port`) becomes a resolved prop on the step. Later steps reference it as `${name.port}`.

### `${...}` expansion

stepwyre expands values from left to right, key by key, in insertion order:

- `${FREE_PORT}` allocates a fresh free TCP port. Each occurrence gets its own port.
- `${REF.prop}` reads a prop from an earlier step (a cross-step reference).
- `${prop}` reads a prop that resolved earlier in the same step.
- `${ENV.NAME}` reads an environment variable. It sees the exports from previous
  oneoff steps. Bash semantics apply: an unset variable is an empty string, not an
  error.
- `${A ?? B}` is a fallback chain. The first defined, non-empty term wins. When
  every term is empty (for example, unset `ENV` vars), the chain resolves to an
  empty string. Example: `port: ${ENV.SERVER_PORT ?? FREE_PORT}` makes a prop
  overridable from the shell.
- `'...'` and `"..."` are string literals. They are valid anywhere in a chain
  (`repo: ${ENV.SRC ?? '/path/with spaces'}`). An unquoted fallback term that
  addresses nothing known is taken verbatim. Nothing known means: no `ENV.`, no
  `FREE_PORT`, no known step ref, no prop. So `${ENV.PG_HOST ?? localhost}` and
  `${ENV.PG_PORT ?? 5432}` work. `${typo}` and an unknown `${step.prop}` reference
  are still errors.

An unresolved `${...}` is an error. `${...}` is the stepwyre expansion namespace.
Inside scripts, reference the shell environment with `$VAR`, not `${VAR}`.

See `examples/harness.yaml` for a config that exercises every feature and then
terminates.

## VS Code debugging

`examples/launch.json` contains a launch config. It runs `dist/harness.js` against
`examples/harness.yaml` in the integrated terminal. Copy it to
`.vscode/launch.json`, or point your workspace at it. Run `pnpm build` first so
that `dist/harness.js` exists.

## Brand

Logo, lockups, and the social banner are in [`brand/`](brand/). The brand book is
[`docs/brand.html`](docs/brand.html). The landing page is
[`docs/index.html`](docs/index.html). Both files are self-contained and ready for
GitHub Pages served from `/docs`.
