# JSON output

`--json` switches to machine output. There is no viewer. stepwyre prints every
event to stdout as one NDJSON envelope:

```json
{ "@log": 1, "step": "...", "stream": "...", "ts": 123, "line": "...", "json": true }
```

The `json` field marks the lines from `logs: json` steps that parsed correctly.
This mode is useful for scripts and agents:

```
stepwyre --json cfg.yaml | jq 'select(.json)'
```

## Lifecycle events

System lines that stepwyre writes about the run carry a `kind` field. Lines
about one step also carry `subject`, the step name:

| `kind`   | line                              | extra fields          |
| -------- | --------------------------------- | --------------------- |
| `step`   | `keepalive db started`            | `subject`, `props`    |
| `done`   | `oneoff env done`                 | `subject`             |
| `ready`  | `keepalive db ready`              | `subject`             |
| `exited` | `keepalive db exited (1)`         | `subject`, `code`     |
| `failed` | `step migrate failed with code 1` | `subject` when a step |
| `boot`   | `boot complete`                   |                       |
| `stop`   | `stopping 3 steps`                |                       |
| `end`    | `run ended (0)`                   | `code`                |

`props` holds the resolved props of the step, every key after `${...}`
expansion except `script`. `code` is the exit code, or the signal name when a
signal ended the child. Lines without `kind` are plain log output.

```
stepwyre --json cfg.yaml | jq -c 'select(.kind=="boot")'
stepwyre --json cfg.yaml | jq -c 'select(.kind=="step") | {subject, props}'
```

See [State file](state.md) for the same data as one JSON document.

## Nested harness protocol

Nested runs use the same protocol. Steps run with `LOGS_JSON=1` set. A nested
stepwyre then emits envelopes. The outer stepwyre unwraps them. Step names compose
(`userapi/start`). Streams, JSON records, `kind`, and `props` survive, and
`subject` composes the same way as `step`. The viewer shows
nested steps with their own prefixes and collapsible records. The step that runs
the nested stepwyre does not need `logs: json`. Give it `ready: nested` so that
the outer boot waits for the nested `boot complete`.
