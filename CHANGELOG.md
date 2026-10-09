# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ready` on keepalive steps: a probe script that gates the next step, with
  `interval` and `timeout`, and `ready: nested` for sub-harness steps
- Lifecycle events carry `kind` (`step`, `done`, `ready`, `exited`, `failed`,
  `boot`, `stop`, `end`), `subject`, `props`, and `code` in `--json` output
  and through the envelope protocol
- `--state <file>` keeps a JSON document with the run phase and the resolved
  props of every step, nested stepwyres included

### Changed

- Teardown waits for the children: SIGTERM to all at once, SIGKILL after
  `stop_timeout` seconds (default 10, per keepalive step). A second Ctrl+C
  kills at once.
- The run now lives after the boot while a keepalive step lives, and ends when
  the last one exits. A keepalive that exits on its own ends the run; its exit
  code decides the stepwyre exit code.

## [0.1.0] - 2026-08-31

### Added

- YAML boot config with ordered bash steps
- `${...}` expansion: free TCP ports, cross-step references, env fallback chains
- Multiple config files per run, with references across files
- `oneoff` and `keepalive` step lifecycles, with stop of all services on teardown
- Full-screen TUI log viewer with colored step prefixes, scroll, and auto-follow
- `logs: json` step option: JSON lines collapse to their message, click to expand
- Pause mode in the viewer for text selection and copy
- `--json` mode with all events as NDJSON on stdout
- Envelope protocol that composes nested stepwyre runs into one stream
- `CI=true` default for step scripts
- ASCII banner at boot and a one-line header in the TUI viewer

[Unreleased]: https://github.com/smoliji/stepwyre/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/smoliji/stepwyre/releases/tag/v0.1.0
