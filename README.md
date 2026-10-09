<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/lockup-dark.svg">
    <img src="brand/lockup-light.svg" alt="stepwyre" width="360">
  </picture>
</p>
<p align="center"><em>Wire your stack, step by step.</em></p>

stepwyre starts your local stack from one YAML file. It runs bash steps in
sequence. A step can allocate free TCP ports, send environment variables to
the steps that follow, or stay alive in the background as a service. A
full-screen log viewer shows the output of all services.

```yaml
boot:
  - name: db_tunnel
    port: ${FREE_PORT}
    lifecycle: keepalive
    ready:
      script: nc -z localhost ${port}
    script: cloud-sql-proxy --port ${port} my-instance

  - name: envs
    script: export SQL_PORT=${db_tunnel.port}

  - name: app
    lifecycle: keepalive
    logs: json
    script: pnpm start
```

stepwyre allocates a free port and starts the tunnel. Once the probe passes it
exports `SQL_PORT` and starts the app. The viewer shows the phase of the run,
the ports, and the logs of both services. Ctrl+C stops all steps and waits for
them to exit.

## Install and run

You need Node 22 or later, and pnpm. The package is not on npm yet.

```
pnpm install && pnpm build
pnpm link --global          # puts `stepwyre` on PATH
stepwyre examples/stepwyre.yaml
```

Several files form one run: `stepwyre infra.yaml app.yaml`. The log viewer
demo: `stepwyre examples/tui-demo.yaml`.

## Features

- Steps are `oneoff` or `keepalive`. The run lives while a keepalive step
  lives. A `ready` probe holds the boot until the service answers.
- `${FREE_PORT}`, `${step.prop}`, `${ENV.PORT ?? FREE_PORT}` expand in any
  prop. The environment a oneoff step exports flows into the steps that follow.
- The viewer collapses JSON logs to their message and can be paused for
  copying. Piped output uses the docker-compose style.
- `--json` prints every event as NDJSON. `--state <file>` keeps a JSON
  document with the phase and the resolved props of every step. `--log <file>`
  writes the NDJSON beside the viewer. A nested stepwyre composes into its
  parent. This is how an agent drives a run and finds the ports.
- Runtime dependencies: Node builtins, plus `ink` and `react` for the viewer.

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
