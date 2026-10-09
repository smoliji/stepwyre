# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
