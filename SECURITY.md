# Security

BagOS signs and submits Solana transactions on your behalf. This document
describes what it can do, what it cannot, and how it handles keys.

## Threat model

The server runs locally, as a subprocess of your MCP client. The realistic
threats are:

1. **A model is convinced to spend more than you intended.** Prompt injection
   through token names, descriptions, or web content the model has read.
2. **Key material escaping** into logs, error messages, or model context.
3. **Wrong-network execution** — believing you are on devnet while signing
   against mainnet.
4. **A transaction reported as successful that never landed.**

Every control below exists for one of those four.

## What the server can do

- Read public Solana and Bags data (analytics, quotes, claimable positions)
- Sign and submit **swaps** and **fee claims** with the keypair you configure
- Create token metadata via the Bags API

## What it cannot do

- **Launch a token.** `bags_prepare_token_metadata` creates metadata only. A
  real launch needs a Meteora fee-share config whose fee-claimer split must be
  your decision, so it is deliberately unimplemented rather than approximated.
- Move funds without passing the token gate, the spend caps, and the
  confirmation step
- Export, print, or transmit your private key

## Key handling

| Property | Behaviour |
|---|---|
| Source | A JSON byte-array file at `BAGS_KEYPAIR_PATH`. Never an env var. |
| Scope | Read once per tool call, used to sign, never persisted or cached |
| Logging | Never logged. The server writes no key material to stdout or stderr. |
| Errors | `JSON.parse` failures on the keypair file are caught and replaced with a generic message — parser errors can quote file contents. |
| Model exposure | `toolError()` returns `error.message` only, never a stack trace, and redacts keypair-shaped byte arrays, long base58 strings, and long base64 blobs. |
| RPC credentials | The startup report prints the RPC endpoint with every query parameter and any basic-auth credentials replaced by `REDACTED`. |

If you believe a key has been exposed, move the funds and generate a new
keypair. This server has no way to rotate one for you.

## Write-path controls

Every write goes through the same sequence. There is no code path that skips it.

```
token gate  →  spend caps  →  confirmation  →  simulate  →  sign  →  send  →  confirm
```

**Token gate.** Write tools require the configured `BOS_TOKEN_MINT` balance to
meet `BOS_REQUIRED_BALANCE`.

**Spend caps.** Two independent limits, both in SOL:

| Variable | Default | Scope |
|---|---|---|
| `BAGS_MAX_SOL_PER_TX` | `0.1` | One transaction |
| `BAGS_MAX_SOL_PER_SESSION` | `1.0` | One server process |

Caps are checked *before* the SDK is called, so an over-cap request never
reaches the network. The session counter increments only after a transaction is
**confirmed** — a failed transaction does not consume your budget.

**Confirmation.** On by default. The first call to a write tool returns a
preview and a single-use token; nothing is signed. The token is a SHA-256
fingerprint of the tool name plus the exact arguments, so a token issued for a
0.01 SOL swap cannot authorize a 10 SOL one. Tokens expire after 5 minutes and
are consumed on every outcome, including failure, so they cannot be replayed.

Set `BAGS_ALLOW_UNCONFIRMED=true` to disable the preview step. **Caps still
apply** — this weakens one control, not all of them.

**Simulation.** Every transaction is simulated before signing. A failed
simulation aborts the write; nothing is submitted.

**Confirmation of landing.** The server waits for network confirmation and
returns the signature and explorer link. If confirmation fails, it reports the
failure and the signature — it never reports success for a transaction that did
not land.

> This last property is the reason for the 2.0.0 release. In 1.x the write tools
> built transactions, discarded them, and reported success unconditionally.
> See CHANGELOG.md.

## Network safety

- **Devnet is the default.** An unconfigured install cannot touch mainnet.
- Mainnet requires `BAGS_NETWORK=mainnet`, and the startup report marks it.
- If your RPC endpoint's cluster disagrees with `BAGS_NETWORK`, the server
  **refuses to start** rather than picking a winner. A "devnet" banner over a
  mainnet endpoint is how people lose money by accident.

## Reporting a vulnerability

Open a security advisory at
<https://github.com/edycutjong/bagos/security/advisories/new>. Please do not
open a public issue for anything affecting key handling or the write path.
