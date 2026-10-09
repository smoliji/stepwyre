# State file

`--state <file>` keeps one JSON document with the current state of the run.
stepwyre rewrites it on every lifecycle event, atomically, so a reader always
sees a complete document. Scripts and agents read it to find ports and URLs,
and to see whether the stack is up.

```
stepwyre --state /tmp/stack.json local.yaml
jq '.steps.userapi.props.port' /tmp/stack.json
```

```json
{
  "pid": 4242,
  "configs": ["/path/local.yaml"],
  "started": 1791531630000,
  "phase": "up",
  "steps": {
    "stack": { "lifecycle": "keepalive", "status": "ready", "props": { "pg_port": "6432" } },
    "userapi": { "lifecycle": "keepalive", "status": "ready", "props": { "port": "4001" } },
    "userapi/start": { "lifecycle": "keepalive", "status": "ready", "props": { "logs": "json" } }
  }
}
```

- `phase` is `booting`, `up`, `stopping`, `stopped`, or `failed`. `up` means
  the last step is done and every `ready` probe passed. After the run ends,
  the file stays with `stopped` or `failed` and the exit `code`. `failure`
  names the step that ended the run early: a failed oneoff, or a keepalive
  that exited with a non-zero code outside teardown.
- `steps` has one entry per step, in boot order. Steps of a nested stepwyre
  appear with composed names (`userapi/start`). `status` is `running`, `done`,
  `ready`, `exited`, or `failed`. `props` holds the resolved props of the
  step, every key after `${...}` expansion except `script`, `name`, and
  `lifecycle`.
- The captured environment of oneoff steps is not in the file. Put the values
  that a reader needs into props.

The file is a projection of the [lifecycle events](json-output.md#lifecycle-events)
in the NDJSON stream; `--json` gives the same data as it happens.
