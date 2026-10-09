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
- Each other key (for example `port`) becomes a resolved prop on the step. Later steps reference it as `${name.port}`.

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
