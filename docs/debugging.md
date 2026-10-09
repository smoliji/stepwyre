# Debugging

## VS Code

[`examples/launch.json`](../examples/launch.json) contains a launch config. It
runs `dist/harness.js` against `examples/stepwyre.yaml` in the integrated
terminal. Copy it to `.vscode/launch.json`, or point your workspace at it. Run
`pnpm build` first so that `dist/harness.js` exists.

## Stdin and CI

stepwyre does not connect step stdin to the terminal. It does not support
interactive child processes. Use the VS Code Debug Console when you debug. Steps run with `CI=true`
unless the caller sets `CI`. This prevents prompts from tools such as pnpm. A
oneoff step fails the boot when the last command of its script exits non-zero. You
do not need an explicit `exit`.

## Build details

The build bundles `src/` into one minified file, `dist/harness.js`, with esbuild.
Type checking is a separate step: `pnpm typecheck` runs `tsc --noEmit`. The bundle
keeps `ink` and `react` external. Keep `node_modules` next to the built file when
you run stepwyre.
