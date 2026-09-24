# Postmortem: the BagOS session cap held for sequential use only

**Status:** fixed in commit `fix(guards): make the session cap hold under concurrent writes` · **Severity:** high (the cap is the main spending control) · **Funds lost:** none known

## Summary

BagOS limits how much SOL an AI agent can spend: a per-transaction cap and a per-session cap. The per-transaction cap was always correct. The session cap was not safe under concurrency. Two confirmed trades running at the same time could both pass a session cap that only one of them fit under.

This was listed as a known limitation in `SECURITY.md` and the README. Documenting it was honest. Leaving a known hole in the project's headline safety control was the wrong call, so it is now fixed.

## What went wrong

`ExecuteTrade` checked the cap and recorded the spend at two different points, with several awaits in between:

```
assertWithinCaps(amount)        // reads sessionSpend
await Mint.toBaseUnits(...)
await getQuote(...)
consumeToken(...)
await createSwapTransaction(...)
await executeTransaction(...)   // sign, send, confirm: seconds
recordSpend(amount)             // only now does sessionSpend move
```

Any second call that reached `assertWithinCaps` during that gap read the old total and passed. With a 1.0 SOL session cap, two confirmed 0.6 SOL trades could both execute, spending 1.2 SOL.

A second, related gap: if `confirmTransaction` threw after the transaction was sent (a timeout or an expired block height), the tool reported an error and **did not count the spend**. That transaction could still land, and a blind retry could spend the same budget again.

## Why the tests didn't catch it

Coverage was 100%. Every line ran; no test ran two writes at the same time. Line coverage shows that code executed, not that the logic is correct when calls interleave.

## The fix

1. **`reserveSpend()`** checks the caps and claims the amount in one synchronous step. Node doesn't yield inside a synchronous function, so no other call can run between the check and the claim. In-flight reservations count against the session cap the same as confirmed spend.
2. **Settle exactly once.** A reservation is committed when the trade confirms and released when the spend provably didn't leave (the build failed, simulation failed, the send was refused, or the transaction failed on chain). Settling a second time does nothing.
3. **Fail closed on an unknown outcome.** `signSendConfirm()` now throws `ConfirmationUnknownError`, with the signature, when confirmation itself throws after sending. `ExecuteTrade` counts that spend, because it may have landed.

## Tests

- **Concurrent confirmed trades:** the first trade is held mid-execution while the second runs inside the gap. The second must be refused, and exactly one execution may happen. **This test fails against the previous code.**
- **Unknown outcome:** the spend is counted, and a blind retry is refused. **This test fails against the previous code.**
- **Unit tests for `reserveSpend`:** commit, release, settling only once, other reservations surviving one release, no float dust, reset.
- **Suite:** 359 tests pass, with 100% line, branch and function coverage. Typecheck, lint and build are clean.

## What I'd do differently

A limitation in a safety control is a bug, not a line in the docs. The fix took about 60 lines of code. The next time I write "known limitation" next to a spending control, I'll open an issue to fix it the same day.
