# Contributing

Thanks for your interest in improving BagOS.

## Getting started

```bash
git checkout -b feat/your-feature
npm ci
cp .env.example .env      # then fill in BAGS_API_KEY
npm run dev               # stdio server with watch
npm run inspector         # MCP Inspector against the built server
```

## Before you open a PR

- `npm run ci` passes — lint, typecheck, and tests with coverage thresholds.
- Tests added or updated for any behavior change.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Breaking changes
  use `!` and are explained in `CHANGELOG.md`.

## Changes to the write path — read this first

`src/lib/execute.ts`, `src/lib/guards.ts`, and `src/lib/network.ts` decide
whether real funds move. Treat any change there as a security change.

Non-negotiable invariants, each covered by tests that must not be weakened:

- A write tool **never** reports success for a transaction that did not
  confirm on chain. If you find yourself returning a success string on a path
  that did not produce a signature, stop.
- Spend caps are checked **before** the Bags SDK is called, and apply even when
  `BAGS_ALLOW_UNCONFIRMED=true`.
- `recordSpend()` runs only after a transaction confirms. A failed transaction
  must not consume the session budget.
- Confirmation tokens are single-use, expire, and are fingerprinted to the exact
  tool name plus arguments. A token issued for a small trade must never
  authorize a larger one.
- No key material in logs, error messages, or tool return values. Errors go
  through `toolError()`.

If you add an SDK mock, verify its shape against
`node_modules/@bagsfm/bags-sdk/dist/types/*.d.ts` first. A mock returning a
shape the SDK never produces is how the v1.x phantom-write bug passed a
100%-coverage suite.

## Reporting bugs / requesting features

Use the issue templates. For anything touching key handling or the write path,
see [SECURITY.md](SECURITY.md) and report privately instead.
