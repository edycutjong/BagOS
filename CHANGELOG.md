# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [2.0.0] — unreleased

### Fixed — the write tools never wrote

In 1.x, all three write tools built a transaction, discarded it, and reported
success. No transaction was ever signed or submitted. The keypair was read from
disk and used only to derive a public key.

| Tool | 1.x behaviour |
|---|---|
| `bags_execute_trade` | `createSwapTransaction()` result discarded; returned `"✅ Trade Execution Signed!"` regardless |
| `bags_claim_fees` | `getClaimTransactions()` result discarded; returned `"✅ Action execution signed successfully."` |
| `bags_launch_token` | Called only `createTokenInfoAndMetadata()`; `initialBuySOL` accepted and silently ignored; never launched anything |

If you used 1.x and believed a trade or claim executed, **it did not**. Check
your wallet history. No funds moved, in either direction.

This survived a 100%-coverage test suite because the SDK mocks returned shapes
the real SDK never produces (`createSwapTransaction` was mocked as resolving to
`{ signature }`). Mocks are now written against the SDK's `.d.ts` files.

### Fixed — mainnet was the silent default

`bags-client.ts` and `token-gate.ts` both fell back to
`https://api.mainnet-beta.solana.com` when `HELIUS_RPC_URL` was unset. An
unconfigured install pointed at mainnet.

### Fixed — key material could reach error messages

`wallet.ts` interpolated `JSON.parse` errors into the thrown message. V8 parse
errors can quote the offending input, which for a keypair file is the secret
key. Parse failures now produce a generic message.

### Added

- **Real execution path** (`lib/execute.ts`) — simulate → sign → send → confirm.
  Returns a confirmed signature and explorer link, or throws. Cannot report
  success for a transaction that did not land.
- **Spend caps** (`lib/guards.ts`) — `BAGS_MAX_SOL_PER_TX` (default 0.1) and
  `BAGS_MAX_SOL_PER_SESSION` (default 1.0), enforced before the SDK is called.
  The session counter increments only on confirmed transactions.
- **Two-step confirmation** — write tools return a preview and a single-use
  token fingerprinted to the exact arguments. Tokens expire after 5 minutes and
  are consumed on every outcome, so they cannot be replayed or reused against
  different arguments. Disable with `BAGS_ALLOW_UNCONFIRMED=true`; caps still apply.
- **Network/RPC agreement check** — the server refuses to start if the RPC
  endpoint's cluster disagrees with `BAGS_NETWORK`.
- **Startup configuration report** on stderr, with RPC credentials redacted.
- **`server.json`** — MCP registry manifest (schema `2025-12-11`).
- **`.github/SECURITY.md`** — threat model and key-handling policy.
- Structured tool errors (`toolError`) — no stack traces to the model; keypair
  byte arrays, long base58 strings, and long base64 blobs redacted.
- **Mainnet-only guard on writes.** The Bags SDK has no devnet deployment — one
  hardcoded API base URL and fixed mainnet program IDs. Write tools on devnet
  now return that explanation instead of failing at simulation with an opaque
  program-not-found.
- **Community health files** under `.github/`: code of conduct, contributing
  guide, security policy, issue templates, PR template.
- **CodeQL** (`security-extended`) and **gitleaks** (full-history secret scan)
  workflows, plus grouped monthly Dependabot with major bumps ignored.
- `docs/examples.md` — worked prompts with real expected output.

### Changed — breaking

- **`bags_launch_token` → `bags_prepare_token_metadata`.** The tool prepares
  metadata; it does not launch. A real launch requires a Meteora fee-share
  config whose fee-claimer split must be the user's decision, so it is left
  unimplemented rather than faked. The ignored `initialBuySOL` parameter is gone.
- **Writes require confirmation by default.** Existing automation that called
  `bags_execute_trade` or `bags_claim_fees` in one shot must either pass a
  confirmation token or set `BAGS_ALLOW_UNCONFIRMED=true`.
- **Default cluster is devnet.** Set `BAGS_NETWORK=mainnet` for the old behaviour.
- **Token-input swaps are refused by default.** The spend caps are
  SOL-denominated and cannot value an arbitrary token, so a swap whose input is
  not SOL would be entirely uncapped. Set `BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true`
  to permit them; the confirmation preview then states that no cap applies.
  Previously such swaps passed every cap and displayed "Spend: 0 SOL".
- **Amounts convert using the mint's real decimals.** Both `bags_execute_trade`
  and `bags_get_trade_quote` previously used a hardcoded `1e9`, so a 6-decimal
  input mint (USDC and most pump-style tokens) traded and quoted 1000x the
  requested size.
- **Package renamed** from `@edycutjong/bagos-mcp-server` (GitHub Packages) to
  **`bagos-mcp-server` on public npm**. The official MCP registry accepts only
  `registry.npmjs.org`, and GitHub Packages requires auth to install even when
  public, so the repo's own publish target was unreachable by `npx`.
  Separately, an unscoped `bagos-mcp-server@1.0.0` was published to npmjs on
  2026-04-21 and is still what `npx bagos-mcp-server` installs today — the
  defective version described above. Publishing 2.0.0 replaces it.
- `bags_execute_trade` drops the `side` parameter, which was declared but never
  read. `inputMint`/`outputMint` fully determine the direction.
- `.env` is now loaded from the working directory, not from a path relative to
  the installed package (which under `npx` resolved inside `node_modules`).

### Notes

- 173 tests. Bypass resistance for the caps and the confirmation step is covered
  explicitly and should be treated as non-negotiable in review. Verified by
  mutation: deleting the cap guard, the confirmation check, the decimals lookup,
  or the spend recorder each fails the suite.

## [1.0.0] — 2026-04-21

Initial release. See the note above before relying on any 1.x write operation.
