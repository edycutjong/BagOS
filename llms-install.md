# Installing BagOS — guide for AI agents

BagOS is an MCP server for Bags on Solana, published on npm as `bagos-mcp-server`.
There is nothing to clone or build. It runs with `npx`.

## 1. Check Node.js

Run `node --version`. BagOS needs Node.js **22 or newer**.

## 2. Get the Bags API key

Ask the user for their Bags API key. They can create one at https://dev.bags.fm.
If they don't have one yet, use the placeholder `your-key-here`. The server still
starts and lists its tools, but tool calls fail until a real key is set.

## 3. Add the server to the MCP settings

For Cline, add this to `cline_mcp_settings.json`. Other clients use the same
`mcpServers` shape.

```json
{
  "mcpServers": {
    "bagos": {
      "command": "npx",
      "args": ["-y", "bagos-mcp-server"],
      "env": {
        "BAGS_API_KEY": "your-key-here"
      }
    }
  }
}
```

Keep the `-y`. Without it, `npx` waits for an install prompt that nobody answers,
and the server never starts.

Put configuration in this `env` block. **BagOS does not read a `.env` file from
the working directory**, on purpose: the working directory is whatever project the
user has open. To load a file, set `BAGS_ENV_FILE` to its absolute path.

## 4. Verify

The server should connect and list 14 tools:

- **Read (11):** `bags_get_creators`, `bags_get_token_creators`,
  `bags_get_token_analytics`, `bags_get_token_claim_stats`,
  `bags_get_token_claim_events`, `bags_get_trade_quote`, `bags_get_partner_stats`,
  `bags_resolve_launch_wallet`, `bags_heartbeat`, `bags_get_claimable_fees`,
  `bags_authenticate`
- **Gated (1):** `bags_prepare_token_metadata`
- **Write (2):** `bags_execute_trade`, `bags_claim_fees`

On startup the server prints a configuration report to stderr. If something is
missing, the report names the variable.

With only an API key, 8 of the 11 read tools work. `bags_heartbeat`,
`bags_get_claimable_fees` and `bags_authenticate` report on the user's own wallet,
so they also need `BAGS_KEYPAIR_PATH`.

## 5. Do not enable trading unless the user asks

The write tools move real funds. Leave these unset unless the user explicitly asks
to trade, and tell them what each one does before you set it:

| Variable | Effect |
|---|---|
| `BAGS_KEYPAIR_PATH` | Path to a Solana keypair JSON. Gives the server a signing key. |
| `BAGS_NETWORK=mainnet` | The default is `devnet`, where Bags writes are refused. |
| `BAGS_ALLOW_UNCONFIRMED=true` | Skips the preview-and-confirm step on writes. |
| `BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true` | Allows swaps from a token other than SOL, which the SOL caps cannot limit. |

Even with trading enabled, every write is capped (0.1 SOL per trade and 1.0 SOL per
session by default) and needs a single-use confirmation token. Every transaction is
simulated before signing, and it is refused if it would take more SOL than was
approved. Details are in [SECURITY.md](.github/SECURITY.md).
