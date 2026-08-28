# Node.js Project Harness

Set of files that make life of a Node.js developer easier in the following areas:
- Running app locally; app that requires connection to Cloud resources, like a database
- Debugging app locally with VS Code

## Features

- Config driven. YAML drives the configuration, which resources to spin up.
- Single purpose Cloud SQL Proxy tunnel (requires Cloud SQL proxy to be intalled on the machine)
- Single purpose Cloud VM tunnel

## Design notes

- Written in minimalistic TypeScript
- Compiled to JS in dist folder
- Development Node.js version 24
- Prefers minimal dependencies (ink + react are the only runtime deps, powering the log viewer)
- Uses pnpm instead of npm
- Contains examples folder for sample configuration
- No comments in the code unless for examples, all code is beautifully readable
- Follows best practices for software development


## Appendix A: Example Use Cases

### Standard Use Case

As a developer working on a Node.js project that, when deployed, runs on GCP
and uses Cloud SQL, Redis Memory store (Available through jumper/bastion VM
instance), Big Query, I want to be able to configure harness so that I can debug
it from VS Code easily:

VS Code configuration should be something like

```json
{
    "type": "node",
    "request": "launch",
    "name": "Debug Development",
    "skipFiles": ["<node_internals>/**"],
    "runtimeExecutable": "path/to/node/version",
    "program": "path/to/harness.js",
    "args": [
      "path/to/harness/config"
    ],
    "console": "integratedTerminal",
    "internalConsoleOptions": "neverOpen"
  }
```

Harness configuration something like

```yaml

# boot: BootStep[]
# BootStep: {
#   name: Type=String. Required.
#   script: Type=String. Supports variable expansion. Required.
#   lifecycle: Type=String, enum=[keepalive,oneoff]. Optional. Default oneoff.
#   logs: Type=String, enum=[json]. Optional.
#   [any_other_prop]: Type=Any. Optional.
# }
# Variable expansion:
#   Any string that supports variable expansion.
#   Variable expansion applies for blocks ${...}
#   BootStep supports expansion by name from the same block. ${name} is a step name, ${port} would be a property named port. Error if not defined.
#   BootStep supports expansion by name from a references block that comes before. ${REF.port} where a REF is a boot step block with name=REF, would expand to a `port` property of that block.
#   Built-in variables:
#     FREE_PORT: Finds a local free port available. Each expansion finds a new free port.
# Lifecycles.
#   oneoff (Default) scripts are executed and forgotten. Oneoffs may use `export ENV=VAR` syntax, then ENV is available in all upcoming steps.
#   keepalive scripts are executed, remembered, and tore down at the end of the harness process.

boot:
  - name: postgres_tunnel
    port: ${FREE_PORT}
    instanceConnection: PROJECT:REGION:INSTANCE
    lifecycle: keepalive
    script: 'cloud-sql-proxy ${instanceConnection} --port=${port}'
  - name: redis_tunnel
    port: ${FREE_PORT}
    lifecycle: keepalive
    script: |
      gcloud compute ssh VM --zone=ZONE --project=PROJECT \
      --ssh-flag="-N -L ${port}:REDIS_PRIVATE_IP:6379"
  - name: secrets
    script: |
      export CFG_JSON_PATH=$(gcloud secrets versions access latest \
      --project=PROJECT \
      --secret=SECRET \
      | jq '{SQL_USER,SQL_DATABASE,SQL_PASSWORD,APP_SECRET}')
  - name: envs
    script: |
      export SQL_HOST="localhost"
      export SQL_PORT=${postgres_tunnel.port}
      export REDIS_HOST="localhost"
      export REDIS_PORT=${redis_tunnel.port}
  - name: app_start
    script: pnpm start
```

Then I can launch VS Code debug session, that will open Cloud SQL tunnel
on a random port, open Redis through a VM on a random port, fetch secrets from
secret manager, and launch pnpm start with all exported
variables (CFG_JSON_PATH, SQL_HOST, ...),.