# DEMO — what actually ran, and what it printed

Every number on this page came out of a real run against the live Bags mainnet API on
**2026-08-15**. Nothing here is mocked, replayed, or hand-written. Where something could
not be run, it says so instead of showing a plausible number.

> **Read the flags.** BagOS ships a `USE_MOCK_DATA` escape hatch, default **off**, which
> affects only the `bags_get_claimable_fees` tool: when on, that tool stamps
> `⚠️ [MOCK DATA ENABLED]` on its own response. Every other tool ignores the flag.
> Everything below was captured with `USE_MOCK_DATA=false` set explicitly, so there is no
> question which path produced it.

---

## Receipt 1 — the read path, live against Bags mainnet

```bash
USE_MOCK_DATA=false BAGS_NETWORK=mainnet node build/index.js --http   # terminal 1
npm run demo                                                          # terminal 2
```

```
Scenarios: 7 passed
Steps:     8 passed
Total:     8 steps across 7 scenarios          wall clock 2.935s
```

| # | Step | Latency | What came back |
|---|---|---|---|
| 1 | HTTP health endpoint | 32ms | status + tool registry |
| 2 | MCP initialize | 17ms | protocol handshake |
| 3 | `bags_heartbeat` | 689ms | wallet status + claimable summary |
| 4 | `bags_get_creators` | 427ms | top creators by lifetime fees |
| 5 | `bags_get_trade_quote` | 388ms | 0.1 SOL → 100002412877777 units |
| 6 | `bags_get_partner_stats` | 329ms | upstream returned HTTP 500 — surfaced as a message, not a crash |
| 7 | `bags_authenticate` | 675ms | signature challenge → API key issued |
| 8 | `bags_execute_trade` | 76ms | **denied by the token gate** |

Real data, not fixtures — step 4 returned live pool state for
`4UeLCRqARmfb6e6KQijtiktqqXUxbfk6jZng7DhuBAGS` ("Asteroid The Space Shiba Inu"), lifetime
fees `3921221301402`.

Step 6 is worth keeping in the table rather than hiding: the Bags partner-stats endpoint
returned a 500 during this run, and the tool reported
`Failed to fetch partner stats: Request failed with status 500` as ordinary text. An
upstream outage does not take the server down or fabricate a value.

---

## Receipt 2 — the safety guards firing, not described

These are the three things the README claims. Each one is reproduced here as output.

**The network-mismatch guard refuses to start.** With `BAGS_NETWORK` left at its `devnet`
default while the configured RPC points at mainnet, the server does not boot:

```
  [FAIL] network   Network mismatch: BAGS_NETWORK is "devnet" but the configured RPC
                   endpoint points at mainnet. Set BAGS_NETWORK=mainnet, or point
                   SOLANA_RPC_URL at a devnet endpoint.

Server not started: fix the [FAIL] items above.
```

The failure mode this prevents is signing a mainnet transaction under a devnet banner.

**The startup report redacts credentials.** The RPC URL carries an API key in its query
string; the report strips it:

```
  [ok]   RPC        https://mainnet.helius-rpc.com/?api-key=REDACTED
```

**The token gate denies a real write in 76ms.** Step 8 above called the actual write tool
against the actual wallet:

```
❌ Access denied: wallet holds 0 $BOS, but 10000 is required to trade.
```

Nothing was signed, nothing was sent, and the refusal came from the gate — not from a
missing key or a mocked branch.

---

## Receipt 3 — the test suite

```bash
npm run ci      # lint + typecheck + tests with coverage
```

```
Test Suites: 13 passed, 13 total
Tests:       212 passed, 212 total
Time:        2.313 s

All files              |     100 |      100 |     100 |     100 |
```

100% of statements, branches, functions and lines — and now actually **enforced** at 100.
`jest.config.ts` previously gated at 90/95/95/95, so the figure above was true by accident
rather than by construction, and would have stopped being true the first time anyone landed
an untested branch. The thresholds are 100 across the board as of this run.

The load-bearing tests are the bypass tests around the spend caps and the confirmation step,
plus the leak-channel test added after the API key was found being echoed into tool output.
They are mutation-checked: removing the cap guard, the confirmation check, the decimals
lookup, or the spend recorder each makes the suite fail.

---

## Receipt 4 — a real transaction, landed on chain and re-fetched

`npm run proof:devnet` pushes a transfer through the **same** `simulate → sign → send →
confirm` path the write tools use (`src/lib/execute.ts`), then re-fetches the signature
from the chain rather than trusting the function's return value. Captured
**2026-08-16**:

```
network   devnet
keypair   3nFqw88x51A2sPZvxg7RjkbmsFUmaPM3EakL71MDYhCw
balance   10 SOL — already funded, skipping the faucet

--- PROOF -------------------------------------------------
signature 2kvu25xWAjqCB3wuNzwMRcN2RMqqfYN6TeJjnA888YtCqNJi9EU9CHSxynkq5QdM499e6yKbXYAwXUbzDKY9U5Dm
slot      484219564
wall      864 ms (simulate + sign + send + confirm)
-----------------------------------------------------------

verified  re-fetched from chain in slot 484219564, err=null
          fee 5000 lamports
```

**Verify it yourself** — this is the point of the receipt, and it needs nothing from us:

<https://explorer.solana.com/tx/2kvu25xWAjqCB3wuNzwMRcN2RMqqfYN6TeJjnA888YtCqNJi9EU9CHSxynkq5QdM499e6yKbXYAwXUbzDKY9U5Dm?cluster=devnet>

```bash
curl -s -X POST https://api.devnet.solana.com \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction",
       "params":["2kvu25xWAjqCB3wuNzwMRcN2RMqqfYN6TeJjnA888YtCqNJi9EU9CHSxynkq5QdM499e6yKbXYAwXUbzDKY9U5Dm",
                 {"encoding":"json","maxSupportedTransactionVersion":0}]}'
# → slot 484219564, meta.err null, meta.fee 5000
```

Why this receipt and not a mainnet one: it is the execution layer that matters here, and
devnet exercises it identically while costing nothing real. **Do not** substitute a
mainnet transaction or a hand-written hash — an unverifiable receipt is worse than an
absent one.

To reproduce from scratch: run it once to print and save the payer address, fund that
address on **devnet** (not testnet), then run again. The keypair persists to `.proof/`
(gitignored), so the second run reuses the same address, and it skips the faucet entirely
when the balance is already there:

```bash
npm run proof:devnet                        # prints the address, saves the keypair
solana airdrop 0.1 <address> --url devnet   # or https://faucet.solana.com, network = Devnet
npm run proof:devnet                        # same address, now funded
```

---

## Receipt 5 — mainnet swap through the real write path — ⚠️ TODO, not yet run

> **Status: not run.** No human has executed this yet, so there is no signature
> below. It stays marked TODO until one exists. An empty receipt is honest; an
> invented one is not, and this file's whole claim is that its numbers came out
> of real runs.

Receipt 4 proves the execution layer lands transactions, but it bypasses the Bags
SDK, the token gate, the caps and the confirmation token — it transfers SOL to
itself on devnet. `scripts/mainnet-proof.ts` exercises the **full**
`bags_execute_trade` path in the order the tool uses it:

```
quote → token gate → spend caps → confirmation token → createSwapTransaction
      → simulate → sign → send → confirm → re-fetch from chain
```

**This spends real money.** It refuses to run unless both variables are set —
there is no default that reaches mainnet — and it enforces a hard **0.01 SOL**
ceiling of its own, independent of `BAGS_MAX_SOL_PER_TX`, so that running it is
never a financial decision.

```bash
# Both are required. Neither has a default.
export I_UNDERSTAND_THIS_SPENDS_REAL_SOL=yes
export BAGS_NETWORK=mainnet

# Your funded mainnet keypair and a Bags API key.
export BAGS_KEYPAIR_PATH=~/.config/bags/keypair.json
export BAGS_API_KEY=...

# The token to swap into, and the gate token you hold.
export PROOF_OUTPUT_MINT=EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS
export BOS_TOKEN_MINT=EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS

npm run proof:mainnet          # swaps 0.01 SOL; PROOF_SOL_AMOUNT can only lower it
```

On success it prints the signature, the explorer link, the slot, and the result
of re-fetching the signature from the chain. Paste that block here, replacing
this notice.

**Do not** substitute a devnet transaction, a hand-written hash, or output from a
run that errored. If it has not been run, this section says so.
