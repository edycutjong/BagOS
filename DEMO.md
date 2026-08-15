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

## Not available in this run

**An on-chain devnet write receipt.** `npm run proof:devnet` generates a throwaway
keypair, funds it from the public faucet, and pushes a transfer through the same
simulate → sign → send → confirm path the write tools use, then re-fetches the signature
from the chain rather than trusting the function's return value.

It could not complete on 2026-08-15: the public Solana faucet returned
`429 Too Many Requests — you've either reached your airdrop limit today or the airdrop
faucet has run dry` across four attempts. The script failed honestly and printed the
address to fund manually.

To fill this in, fund the printed address from <https://faucet.solana.com> and re-run:

```bash
npm run proof:devnet
```

Then paste the signature and its explorer link here. **Do not** substitute a mainnet
transaction or a hand-written hash — an unverifiable receipt is worse than an absent one.
