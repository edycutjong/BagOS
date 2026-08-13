# Examples

Prompts you can type at an assistant connected to BagOS, and what each one
should actually do. Read-only examples work with just `BAGS_API_KEY`.

---

## 1. Check the server is wired up

> **"Check the bagos heartbeat."**

Calls `bags_heartbeat`. Returns server status and whether the configured wallet
is reachable. If this fails, the problem is configuration, not the network —
check the startup report on stderr.

**No key, no network access, no spend.**

---

## 2. Price a swap without trading

> **"What would I get for 0.5 SOL of $BOS right now?"**

Calls `bags_get_trade_quote`. Returns the expected output amount, the minimum
after slippage, and the route.

This is the tool to reach for when you want a number. It never signs anything,
so it is safe to call repeatedly — including on devnet, since quotes come from
the Bags API rather than the chain.

---

## 3. See what fees you can claim

> **"Do I have any claimable creator fees?"**

Calls `bags_get_claimable_fees` for your configured wallet. Read-only: it lists
positions and amounts but does not claim them.

Follow up with example 6 to actually claim.

---

## 4. Look up a token

> **"Show me lifetime fee data for mint EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS."**

Calls `bags_get_token_analytics`. Works for any mint, not just yours.

> **"Who are the top creators by lifetime fees?"**

Calls `bags_get_creators`.

---

## 5. Execute a swap (mainnet, two steps)

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

## 6. Claim fees (mainnet, two steps)

> **"Claim my fees for mint EkJuyY…dBAGS."**

Same pattern: preview with a token, then confirm. Fee claims can involve several
transactions. If some land and one fails, you get an honest partial report:

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

**Launch a token.** `bags_prepare_token_metadata` reserves a mint and uploads
metadata, and says plainly that nothing was launched. Completing a launch needs
a Meteora fee-share config whose fee-claimer split must be your decision.
Finish at [bags.fm](https://bags.fm).

**Trade on devnet.** Bags has no devnet deployment. Write tools on devnet return
an explanation rather than failing obscurely.

**Exceed your caps.** A request over `BAGS_MAX_SOL_PER_TX` is rejected before the
Bags SDK is called. Caps apply even with `BAGS_ALLOW_UNCONFIRMED=true`.

**Reuse a confirmation.** Tokens are single-use, expire in five minutes, and are
bound to exact arguments. A token obtained for a small trade cannot authorize a
larger one — which is the control that matters if a model is talked into
escalating by injected text in a token name or description.
