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
reaches the network. The amount is **reserved against the session cap in the
same step it is checked**, so two concurrent writes cannot both pass a cap only
one of them fits under. The reservation is kept if the transaction confirms, and
also if its outcome is unknown (see *fails closed* under Known limitations),
because it may still land. It is released — and the budget returned — only when
the spend provably did not happen: a failed build, a failed simulation, a send
the node refused before forwarding, or an on-chain failure.

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

## Known limitations

These are real gaps, documented rather than hidden. An adversarial review of
v2.0.0 surfaced them; each is a deliberate deferral, not an oversight.

**The caps only bind on SOL.** They cannot value an arbitrary token, so a
non-SOL-input swap is uncapped. Such swaps are refused unless you set
`BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true`, and the preview then says so. In
v2.0.0-pre this silently displayed "Spend: 0 SOL" and passed every cap.

**The confirmation token binds arguments, not the quoted price.** Confirming
re-runs the quote, so the `expect`/`min` figures you approved are not what
executes if the price moved inside the five-minute window. Your slippage
setting bounds execution against the **re-fetched** quote, not against the
preview you approved: the total move from the previewed price is the market
drift over that window *plus* slippage on the new quote, so slippage alone does
not bound it. Treat the preview numbers as indicative, not a guarantee, and keep
the window short. The same applies to fee claims, where the transaction set is
re-fetched at confirmation.

**The session cap fails closed on an unknown outcome.** Each write reserves
its amount against the cap in the same synchronous step as the cap check, so
concurrent calls cannot both fit under a cap only one of them fits under. If
the transaction was sent but confirmation threw (timeout, expired block
height) or the send call failed with anything other than a pre-forward
rejection (preflight simulation failure, signature verification failure,
undecodable transaction), including timeouts, proxy 5xx/429 and RPC internal
errors, the tool reports `ConfirmationUnknownError` with the signature and
**counts the spend**, because it may still land. A spend that never left
(build failure, failed simulation, refused send, failed on chain) is released.
Check the signature on an explorer before retrying; restart the server to reset
the counter if it did not land.

**Configuration comes from the operator only.** The server does not read a
`.env` from its working directory: MCP clients start stdio servers in the open
project's folder, so that file may belong to a repository you cloned. Name an
env file explicitly with `BAGS_ENV_FILE`. `bags_authenticate` takes no keypair
path from the model, only talks to `https://*.bags.fm` unless
`BAGS_ALLOW_CUSTOM_API_URL=true`, and signs only Bags' own
wallet-verification text (as published in `bagsfm/bags-skill` `auth.md`)
carrying the nonce from the same init response. Anything else is refused: a
Solana transaction message, any binary payload, another service's sign-in
text. A signature over a transaction message is a signed transaction.

**HTTP mode is unauthenticated.** `--http` / `npm run start:http` serves `/mcp`
on `0.0.0.0` with permissive CORS and no auth — anyone who can reach the port
can invoke the write tools, and all callers share one spend counter and one
token namespace. **Do not run HTTP mode on a funded wallet or an untrusted
network.** The controls in this document assume the default stdio transport,
running locally as a subprocess of your MCP client.

**Cluster detection is substring-based.** A testnet endpoint is not recognised
and is taken on trust under whatever `BAGS_NETWORK` says.

**Known transitive audit advisories.** `npm audit` reports high/moderate
advisories in this tree. What can be fixed has been: `js-yaml` is pinned to
`^4.3.2` / `^3.15.2` via `overrides`. The remainder — chiefly `bigint-buffer`
(GHSA-3gc7-fjrx-p6mg, **no patched version exists**), plus `toml`, `jayson` and
`stream-json` — arrives transitively through `@bagsfm/bags-sdk` and the Meteora /
Solana stack, where the only "fix" npm offers is a breaking downgrade of the SDK
that removes trade and partner functionality. Those are tracked and ratcheted in
`.audit-baseline.json` (CI fails on any new or critical advisory) rather than
force-fixed. They live in dependencies used to build and sign transactions, not
in a path that parses untrusted YAML/TOML, so reachability is low. Root-project
`overrides` protect this repository and its CI but do not reach consumers of the
published package; that requires the SDK to unpin its own transitives upstream.

## Reporting a vulnerability

Open a security advisory at
<https://github.com/edycutjong/bagos/security/advisories/new>. Please do not
open a public issue for anything affecting key handling or the write path.
