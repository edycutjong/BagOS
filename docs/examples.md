# Examples

Prompts you can type at an assistant connected to BagOS, and what each one
should actually do.

All 14 tools are covered. The 11 read tools work with just `BAGS_API_KEY` and
never sign anything. The two write tools and the one gated tool are marked.

| | Tool | What it needs |
|---|---|---|
| 1 | `bags_heartbeat` | nothing |
| 2 | `bags_authenticate` | a local keypair |
| 3 | `bags_get_trade_quote` | `BAGS_API_KEY` |
| 4 | `bags_get_token_analytics` | `BAGS_API_KEY` |
| 5 | `bags_get_creators` | `BAGS_API_KEY` |
| 6 | `bags_get_token_creators` | `BAGS_API_KEY` |
| 7 | `bags_get_token_claim_stats` | `BAGS_API_KEY` |
| 8 | `bags_get_token_claim_events` | `BAGS_API_KEY` |
| 9 | `bags_get_claimable_fees` | `BAGS_API_KEY` |
| 10 | `bags_get_partner_stats` | `BAGS_API_KEY` |
| 11 | `bags_resolve_launch_wallet` | `BAGS_API_KEY` |
| 12 | `bags_prepare_token_metadata` | `BAGS_API_KEY` — gated, launches nothing |
| 13 | `bags_execute_trade` | mainnet + confirmation — **spends** |
| 14 | `bags_claim_fees` | mainnet + confirmation — **spends gas** |

---

## 1. Check the server is wired up

> **"Check the bagos heartbeat."**

Calls `bags_heartbeat`. Returns server status and whether the configured wallet
is reachable. If this fails, the problem is configuration, not the network —
check the startup report on stderr.

**No key, no network access, no spend.**

---

## 2. Authenticate for the endpoints that need it

> **"Authenticate with Bags."**

Calls `bags_authenticate`, which runs the Bags V2 signature challenge and loads
your local wallet automatically — from `~/.config/bags/keypair.json`, or
`BAGS_KEYPAIR_PATH` if you set it.

Signing a challenge is not signing a transaction: this proves you hold the key,
it does not move anything.

---

## 3. Price a swap without trading

> **"What would I get for 0.5 SOL of $BOS right now?"**

Calls `bags_get_trade_quote`. Returns the expected output amount, the minimum
after slippage, and the route.

This is the tool to reach for when you want a number. It never signs anything,
so it is safe to call repeatedly — including on devnet, since quotes come from
the Bags API rather than the chain.

---

## 4. Look up a token

> **"Show me lifetime fee data for mint EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS."**

Calls `bags_get_token_analytics`. Works for any mint, not just yours.

---

## 5. Find creators

> **"Who are the top creators by lifetime fees?"**

Calls `bags_get_creators` — a leaderboard across Bags, paginated with `limit`
and `offset` (default 10).

> **"Who shares the fees on mint EkJuyY…dBAGS?"**

Calls `bags_get_token_creators`, which is the per-token question rather than the
global one: every creator sharing that token's fees, their wallet, their social
provider, and their share in basis points.

---

## 6. Audit who has claimed what

> **"What has each creator claimed on mint EkJuyY…dBAGS?"**

Calls `bags_get_token_claim_stats` — per-creator totals, each with its royalty
split and the amount claimed so far.

> **"Show me the claim history for that mint."**

Calls `bags_get_token_claim_events` — the audit trail behind those totals: who
claimed, how much, when, and the transaction signature for each. Paginated via
`limit` and `offset` (default 100), so ask for a page at a time on busy tokens.

Both are read-only, and the signatures they return resolve on any explorer —
useful when you want to verify a claim independently rather than trust a total.

---

## 7. See your own earnings

> **"Do I have any claimable creator fees?"**

Calls `bags_get_claimable_fees` for your configured wallet. Read-only: it lists
positions and amounts but does not claim them. Follow up with example 11 to
actually claim.

> **"What have I earned as a referral partner?"**

Calls `bags_get_partner_stats` for a partner public key.

---

## 8. Resolve a social handle to a wallet

> **"Which Bags wallet does @someone on twitter launch from?"**

Calls `bags_resolve_launch_wallet`. Takes a username (a leading `@` is stripped
for you) and one of `twitter`, `tiktok`, `kick`, or `github`.

Useful before a claim or a lookup, when you know the person but not the address.

---

## 9. Prepare token metadata

> **"Reserve a mint and upload metadata for my token."**

Calls `bags_prepare_token_metadata`. It reserves a mint and uploads metadata,
then says plainly that **nothing was launched**.

Completing a launch needs a Meteora fee-share config whose fee-claimer split must
be your decision, not a model's. Finish at [bags.fm](https://bags.fm).

---

## 10. Execute a swap (mainnet, two steps) — **spends**

> **"Swap 0.05 SOL for $BOS."**

**First response — nothing has been signed:**

```
⚠️  CONFIRMATION REQUIRED — nothing has been signed or sent.

Action:  Swap 0.05 of So11111111111111111111111111111111111111112
         for       EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS
         expect    4823917722 (min 4679199990)
         slippage  3%
         wallet    975whRaNDNT5szLYEvE8GHYDtEmA4HVvp5qk6RoiCxo7
         network   🔴 MAINNET — real funds

Spend:   0.05 SOL
Caps:    0.1 SOL/tx · 0/1 SOL used this session

🔴 This is MAINNET. Confirming moves real funds.

To execute, call bags_execute_trade again with the identical arguments plus:
  confirm: "kR3nT9xQm2vP"

Token is single-use and expires in 5 minutes.
```

Read it. If the numbers are wrong, say so and the assistant re-quotes — the old
token becomes useless because it is bound to the old arguments.

> **"Yes, go ahead."**

**Second response — after it actually lands:**

```
✅ Swap confirmed on chain. 🔴 MAINNET — real funds

Signature: 4pF2mK…9xQr
Explorer:  https://explorer.solana.com/tx/4pF2mK…9xQr
Slot:      298471023

Swapped 0.05 of So1111…1112 for EkJuyY…dBAGS at max 3% slippage.
```

The signature is real and the explorer link resolves. If the transaction had
failed at simulation or confirmation, you would get an error instead — never a
success message for something that did not happen.

---

## 11. Claim fees (mainnet, two steps) — **spends gas**

> **"Claim my fees for mint EkJuyY…dBAGS."**

Calls `bags_claim_fees`. Same pattern as example 10: preview with a token, then
confirm. Fee claims can involve several transactions. If some land and one
fails, you get an honest partial report:

```
⚠️  Partial claim. 2 of 3 transactions confirmed.

  1. 3nB8x…Kp2   https://explorer.solana.com/tx/3nB8x…Kp2
  2. 7yT4m…Wq9   https://explorer.solana.com/tx/7yT4m…Wq9

Transaction 3 failed: insufficient funds for rent
Remaining transactions were not submitted.
```

---

## What the assistant cannot do

Worth knowing, because a model may confidently offer:

**Launch a token.** See example 9 — metadata is prepared, the launch is yours to
finish.

**Trade on devnet.** Bags has no devnet deployment. Write tools on devnet return
an explanation rather than failing obscurely.

**Swap a non-SOL token without opting in.** The caps are SOL-denominated and
cannot value an arbitrary token, so such a swap would be uncapped. It is refused
unless you set `BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true`, and the preview then says
plainly that no cap applies rather than showing a misleading "Spend: 0 SOL".

**Exceed your caps.** A request over `BAGS_MAX_SOL_PER_TX` is rejected before the
Bags SDK is called. Caps apply even with `BAGS_ALLOW_UNCONFIRMED=true`.

**Reuse a confirmation.** Tokens are single-use, expire in five minutes, and are
bound to exact arguments. A token obtained for a small trade cannot authorize a
larger one — which is the control that matters if a model is talked into
escalating by injected text in a token name or description.
