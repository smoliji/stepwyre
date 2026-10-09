# Log viewer

When stdout and stdin are a terminal, stepwyre runs a full-screen log viewer. The
viewer prefixes each line with its step name. For steps marked `logs: json`, the
viewer collapses each JSON line to `▸ <message>`. The viewer reads the message from
the `msg` or `message` key. The `level` value sets the row color. Click a row to
expand or collapse the full record.

Try it: `node dist/harness.js examples/tui-demo.yaml`

## Header

The two top rows show the run. The first row has the phase of the run
(`booting`, `up`, `stopping`, `stopped`, `failed (step)`), the pid of
stepwyre, and the config files. The second row lists the keepalive steps with
their status (`◐ starting`, `● ready`, `○ exited`, `✖ failed`) and the `port`
prop when the step has one. Steps of a nested stepwyre count through the parent
step.

```
▂▄▆ stepwyre · up · pid 48213 · infra-local.yaml svc-userapi.yaml
 stack ● ready :49557   userapi ● ready :49564
```

The header is the same projection as the [state file](state.md).

## Keybindings

- Scroll with the mouse wheel or the arrow keys. When you scroll up, auto-follow
  stops. Scroll to the bottom, or press `G`, to start auto-follow again.
- Press `g` to jump to the top.
- Press Ctrl+C to stop all steps.
- Press space to pause the viewer.

## Pause and copy

Press space to pause the viewer. The screen freezes and mouse reporting stops. You
can then select and copy text without the Shift key. Press space again to resume.
The viewer then shows the buffered logs. On exit, stepwyre prints the last visible
screen, with the expanded records, to the normal terminal. stepwyre does not
persist anything else.

## Non-TTY mode

When stdout or stdin is not a terminal (a pipe or CI), stepwyre prints prefixed
lines in the docker-compose style. For JSON steps it prints only the message.

Progress lines go to stderr. stepwyre colors them when stderr is a terminal. Set
`NO_COLOR` to disable colors. Set `FORCE_COLOR` to keep colors when you pipe the
output.

For machine output see [JSON output](json-output.md).
