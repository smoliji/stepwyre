<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/lockup-dark.svg">
    <img src="brand/lockup-light.svg" alt="stepwyre" width="360">
  </picture>
</p>
<p align="center"><em>Wire your stack, step by step.</em></p>

stepwyre starts your local stack from one YAML file. It runs bash steps in
sequence. A step can allocate free TCP ports. A step can send environment
variables to the steps that follow. A step can stay alive in the background as
a service. A full-screen log viewer shows the output of all services.

```yaml
boot:
  - name: db_tunnel
    port: ${FREE_PORT}
    lifecycle: keepalive
    script: cloud-sql-proxy --port ${port} my-instance

  - name: envs
    script: export SQL_PORT=${db_tunnel.port}

  - name: app
    lifecycle: keepalive
    logs: json
    script: pnpm start
```

Run this config. stepwyre allocates a free port and starts the tunnel. It
exports `SQL_PORT` and starts the app. The viewer shows the logs of the two
services. Press Ctrl+C to stop all steps.

## Install and run

You need Node 22 or later, and pnpm.

```
pnpm install && pnpm build
node dist/harness.js examples/stepwyre.yaml
```

Run the log viewer demo: `node dist/harness.js examples/tui-demo.yaml`

## Features

- stepwyre runs the boot steps in sequence. A step has a `oneoff` or a
  `keepalive` lifecycle. The run lives while a keepalive step lives.
- A `ready` probe on a keepalive step holds the boot until the service answers.
  `boot complete` tells scripts that the stack is up.
- `${FREE_PORT}` allocates a free TCP port. `${step.prop}` reads a value from
  an earlier step. `${ENV.PORT ?? FREE_PORT}` is a fallback chain.
- The environment that a `oneoff` step exports flows into the steps that follow.
- The log viewer collapses JSON log lines to their message. You can pause the
  viewer and copy text. Piped output uses the docker-compose style.
- The `--json` option prints all events as NDJSON. A nested stepwyre run
  composes into the parent run. `--state <file>` keeps a JSON document with
  the phase of the run and the resolved props of every step.
- The runtime dependencies are the Node builtins, plus `ink` and `react` for
  the viewer.

## Documentation

- [Agent skill](skills/stepwyre/SKILL.md): the repo doubles as a Claude Code
  plugin. Install it from this repo and an agent gets the `/stepwyre` skill with
  the config essentials and the background run recipe.
- [Config format and `${...}` expansion](docs/config.md)
- [TUI log viewer](docs/viewer.md)
- [JSON output and nested stepwyres](docs/json-output.md)
- [State file](docs/state.md)
- [Debugging](docs/debugging.md)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

The brand assets are in [`brand/`](brand/). The brand book is
[`docs/brand.html`](docs/brand.html). The landing page is
[`docs/index.html`](docs/index.html). The two files are self-contained.
GitHub Pages serves them from `/docs`.

## License

MIT. See [LICENSE](LICENSE).
