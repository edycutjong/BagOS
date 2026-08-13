## Summary
<!-- What does this PR change and why? -->

## Changes
-

## Checklist
- [ ] `npm run ci` passes (lint, typecheck, tests, coverage thresholds)
- [ ] Tests added/updated for the change
- [ ] Docs / README / CHANGELOG updated if behavior changed

## Write-path changes only
<!-- Delete this section if the PR does not touch execute.ts, guards.ts, or network.ts -->
- [ ] No path returns success without a confirmed on-chain signature
- [ ] Spend caps still enforced before the SDK is called, and with `BAGS_ALLOW_UNCONFIRMED=true`
- [ ] `recordSpend()` still runs only on confirmed transactions
- [ ] Confirmation tokens still single-use and argument-bound
- [ ] No new path can place key material in a log, error, or return value
- [ ] Any new SDK mock checked against the SDK's own `.d.ts`

## Related issues
Closes #
