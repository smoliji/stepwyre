# JSON output

`--json` switches to machine output. There is no viewer. stepwyre prints every
event to stdout as one NDJSON envelope:

```json
{"@log":1,"step":"...","stream":"...","ts":123,"line":"...","json":true}
```

The `json` field marks the lines from `logs: json` steps that parsed correctly.
This mode is useful for scripts and agents:

```
stepwyre --json cfg.yaml | jq 'select(.json)'
```

## Nested harness protocol

Nested runs use the same protocol. Steps run with `LOGS_JSON=1` set. A nested
stepwyre then emits envelopes. The outer stepwyre unwraps them. Step names compose
(`userapi/start`). Streams and JSON records survive. The viewer shows nested steps
with their own prefixes and collapsible records. The step that runs the nested
stepwyre does not need `logs: json`.
