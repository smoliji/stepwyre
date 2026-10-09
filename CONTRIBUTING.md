# Contributing

One person maintains stepwyre. Issues and small, focused PRs are welcome. For
a large change, open an issue first.

## Develop

You need Node 22 or later, and pnpm.

```
pnpm install
pnpm test         # node:test, colocated src/**/*.test.ts
pnpm typecheck
pnpm format       # prettier
pnpm build        # bundle to dist/harness.js
```

## Rules

- Do not add runtime dependencies.
- Keep pure logic separate from IO.
- Add a test for each new behavior.
- Keep a PR to one change.
