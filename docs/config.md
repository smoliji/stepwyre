# Config format

The config has one `boot` key. It holds a sequence of steps. stepwyre runs the
steps in order. Each step is a mapping:

- `name` is required and must be unique. Later steps reference its props as `${name.prop}`.
- `script` is required. It runs under `bash -c`. Use a `|` block scalar for multi-line scripts.
- `lifecycle` is optional. The values are `oneoff` (default) and `keepalive`.
  - A `oneoff` step runs to completion. The environment it exports flows into the
    steps that follow. When the last command of its script exits non-zero, the
    boot fails. You do not need an explicit `exit`.
  - A `keepalive` step starts in the background and stays running. stepwyre stops it on teardown.
- `ready` is optional and only valid on a `keepalive` step. See [Readiness](#readiness).
- `stop_timeout` is optional and only valid on a `keepalive` step. See [Run lifetime](#run-lifetime).
- Each other key (for example `port`) becomes a resolved prop on the step. Later steps reference it as `${name.port}`.

## Run lifetime

stepwyre runs the steps in order. When the last step is done, it emits
`boot complete`. The run then lives while at least one `keepalive` step lives.
Ctrl+C, SIGTERM, or a failing step ends the run. A keepalive child that exits
on its own also ends the run. The exit code is 0 when the child exited with 0,
otherwise 1.

On teardown stepwyre sends SIGTERM to every live child at once and waits for
them. A child that is still running after `stop_timeout` seconds (default 10)
gets SIGKILL. Set `stop_timeout` on a keepalive step that needs longer, for
example a docker compose stack. A second Ctrl+C during the teardown kills all
children at once.

## Readiness

A `keepalive` step can declare when it is ready. The next step waits for it.

```yaml
- name: postgres
  port: ${FREE_PORT}
  lifecycle: keepalive
  ready:
    script: pg_isready -h localhost -p ${port}
    interval: 1
    timeout: 60
  script: docker run --rm -p ${port}:5432 postgres:16
```

- `script` runs under `bash -c` with the step environment. `${...}` expansion
  applies, so it can use the step props. stepwyre runs it every `interval`
  seconds (default 1) until it exits 0.
- `timeout` (default 60) is in seconds. When the probe has not passed by then,
  the boot fails. When the keepalive child exits before the probe passes, the
  boot fails at once.
- `ready: nested` is for a step that runs another stepwyre. The step is ready
  when the nested run emits `boot complete`. There is no timeout; the nested
  run enforces its own.

A ready step emits `keepalive <name> ready`. Both this line and `boot complete`
carry a `kind` field in [JSON output](json-output.md), so scripts can wait for
them without matching text.

## Multiple config files

```
node dist/harness.js infra.yaml app.yaml
```

Arguments are paths to YAML configs. stepwyre concatenates their `boot` lists in
argument order into one run. Step names must be unique across all files.
`${ref.prop}` references work across files. On SIGINT or SIGTERM, and after a
failed step, stepwyre stops all keepalive children before it exits.

## `${...}` expansion

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

See [`examples/stepwyre.yaml`](../examples/stepwyre.yaml) for a config that
exercises every feature and then terminates.
