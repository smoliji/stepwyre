---
name: stepwyre
description: How to use stepwyre, the YAML boot orchestrator, from an agent - write a config for a local stack (ports, env passing, keepalive services, ready probes, nested configs), run it in the background with --json and --state, wait for the stack to be up, read ports from the state file, and tear it down. Use when a task needs one or more local services running deterministically for an integration check, or when the user mentions stepwyre. /stepwyre
user-invocable: true
argument-hint: "[config.yaml ...]"
---

# stepwyre

`stepwyre` starts a local stack from YAML: ordered bash steps, free port
allocation, env passing between steps, background services with ready probes,
and a machine-readable state. Full docs are in `docs/` next to this plugin
(`config.md`, `json-output.md`, `state.md`); the binary comes from
`npm install -g stepwyre`, or `pnpm link --global` in a checkout.

## Config essentials

```yaml
boot:
  - name: db                      # unique; later steps use ${db.port}
    port: ${FREE_PORT}            # any extra key is a prop; ${port} inside this step
    lifecycle: keepalive          # stays running; default is oneoff
    stop_timeout: 30              # seconds before SIGKILL on teardown (default 10)
    ready:                        # keepalive only; next step waits for exit 0
      script: pg_isready -h localhost -p ${port}
      interval: 1
      timeout: 60
    script: docker run --rm -p ${port}:5432 postgres:16

  - name: env                     # oneoff: its exports flow into later steps
    script: export DATABASE_URL=postgres://localhost:${db.port}/app

  - name: app
    lifecycle: keepalive
    logs: json                    # JSON log lines collapse to their message
    ready:
      script: curl -sf http://localhost:${ENV.PORT ?? 3000}/healthz
    script: pnpm start
```

- `${FREE_PORT}` fresh port per occurrence; `${step.prop}` earlier step; `${prop}` same step; `${ENV.X}` environment; `${A ?? B ?? 'literal'}` fallback chain.
- `${...}` is stepwyre's namespace: inside scripts use `$VAR`, never `${VAR}`.
- A oneoff whose last command fails ends the boot. Steps get `CI=true` and no stdin.
- After the last step: `boot complete`. The run then lives while a keepalive lives; a keepalive that exits ends the run.
- Several files form one run: `stepwyre infra.yaml app.yaml`; `${ref.prop}` works across them. Keep shared infra in one file and each service in its own, then pick the files per run.
- Nesting: a keepalive step with `ready: nested` runs another `stepwyre x.yaml`; its steps show as `name/step` and its props reach the parent.

## Run it from an agent

```bash
RUN=/tmp/stepwyre/<name>; mkdir -p $RUN
stepwyre --json --state $RUN/state.json cfg.yaml < /dev/null > $RUN/log.ndjson 2>&1 & echo $! > $RUN/pid
```

Use `run_in_background`. One directory per run; several runs can live side by side and connect through URLs in env. Then poll once a second:

```bash
jq -r .phase $RUN/state.json      # booting | up | stopping | stopped | failed
```

Stop at `up` or `failed`. Ports and URLs:

```bash
jq -c '.steps | with_entries(select(.value.props.port)) | map_values(.props.port)' $RUN/state.json
```

On `failed`, find the step with `status: failed` and read its output:

```bash
jq -r '.steps | to_entries[] | select(.value.status=="failed") | .key' $RUN/state.json
jq -r 'select(.step=="<that step>") | .line' $RUN/log.ndjson | tail -30
```

Lifecycle lines in the log carry `kind` (`step`, `done`, `ready`, `exited`, `failed`, `boot`, `stop`, `end`): `jq -r 'select(.kind) | [.kind,.step,.line] | @tsv' $RUN/log.ndjson`.

Teardown:

```bash
kill -TERM $(cat $RUN/pid)        # then poll .phase until stopped or failed
```

Teardown SIGTERMs every child at once and waits up to `stop_timeout` each. A second SIGTERM kills at once. A dead pid with `phase: up` is a stale file from a run that was killed hard.

## Writing an ad hoc config

Keep it to what the check needs. Put inputs in a first oneoff step with `${ENV.X ?? default}` props so the config is overridable from the shell. Give every keepalive a `ready` probe; without one the next step starts at once. Write the file into the run dir, not the repo, unless the user wants to keep it.
