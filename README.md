# BagOS

An MCP server that lets an AI assistant read Bags/Solana token data and — with
explicit confirmation — execute swaps and claim creator fees from your wallet.

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/edycutjong/bagos/actions)
[![npm](https://img.shields.io/npm/v/bagos-mcp-server?color=CB3837&logo=npm)](https://www.npmjs.com/package/bagos-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **v2.0.0 corrects a serious defect.** In 1.x the write tools built
> transactions, discarded them, and reported success — nothing was ever signed
> or submitted. If you used 1.x and believed a trade or claim executed, it did
> not. See [CHANGELOG.md](CHANGELOG.md).

---

## Install

```bash
npx bagos-mcp-server
```

You need a Bags API key from [dev.bags.fm](https://dev.bags.fm). That alone
enables the read-only tools. For trading and fee claims you also need a Solana
keypair file and the gating token — see [Write tools](#write-tools).

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Claude Code

```bash
claude mcp add bagos --env BAGS_API_KEY=your-key-here -- npx -y bagos-mcp-server
```

Restart the client, then ask it: *"check the bagos heartbeat"*. The server
prints a configuration report to stderr on startup; if something is missing it
tells you which variable and why.

---

## Tools

| Tool | Type | What it does |
|---|---|---|
| `bags_heartbeat` | read | Server status and wallet reachability |
| `bags_get_token_analytics` | read | Lifetime fee data for a token mint |
| `bags_get_creators` | read | Top token creators by lifetime fees |
| `bags_get_trade_quote` | read | Price quote for a swap. Does not trade. |
| `bags_get_claimable_fees` | read | Fees currently claimable by your wallet |
| `bags_get_partner_stats` | read | Partner config claim statistics |
| `bags_authenticate` | read | Verify wallet ownership via Ed25519 signature |
| `bags_prepare_token_metadata` | gated | Creates token info + metadata. **Does not launch a token.** |
| `bags_execute_trade` | **write** | Swap tokens. Signs and submits. |
| `bags_claim_fees` | **write** | Claim creator/LP fees. Signs and submits. |

`bags_prepare_token_metadata` reserves a mint and uploads metadata. Completing a
launch also requires a Meteora fee-share config, whose fee-claimer split has to
be your decision — so this server does not implement that step rather than
guessing at it. Finish the launch at [bags.fm](https://bags.fm).

---

## Write tools

Writes are off unless you configure them, and they are mainnet-only.

**Bags has no devnet deployment.** Its API endpoint and its Meteora/fee-share
program IDs are all mainnet. This server nonetheless defaults to **devnet**, so
an unconfigured install cannot spend real money. Calling a write tool on devnet
returns an explanation, not a cryptic program error.

To enable writes:

```json
{
  "mcpServers": {
    "bagos": {
      "command": "npx",
      "args": ["-y", "bagos-mcp-server"],
      "env": {
        "BAGS_API_KEY": "your-key-here",
        "BAGS_NETWORK": "mainnet",
        "BAGS_KEYPAIR_PATH": "~/.config/bags/keypair.json",
        "BOS_TOKEN_MINT": "EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS",
        "BAGS_MAX_SOL_PER_TX": "0.1",
        "BAGS_MAX_SOL_PER_SESSION": "1.0"
      }
    }
  }
}
```

### Every write goes through this

```
token gate → spend caps → confirmation → simulate → sign → send → confirm
```

The first call to a write tool **signs nothing**. It returns a preview and a
single-use token:

```
⚠️  CONFIRMATION REQUIRED — nothing has been signed or sent.

Action:  Swap 0.05 of So1111…1112
         for       EkJuyY…dBAGS
         expect    4823917722 (min 4679199990)
         slippage  3%
         network   🔴 MAINNET — real funds

Spend:   0.05 SOL
Caps:    0.1 SOL/tx · 0/1 SOL used this session

To execute, call bags_execute_trade again with the identical arguments plus:
  confirm: "kR3nT9xQm2vP"
```

The token is a fingerprint of the tool name plus the exact arguments, so one
issued for a 0.01 SOL swap cannot authorize a 10 SOL one. It expires in five
minutes and is consumed on every outcome, so it cannot be replayed.

On success you get a real signature and explorer link — never a success message
for a transaction that did not land.

Set `BAGS_ALLOW_UNCONFIRMED=true` to skip the preview. Spend caps still apply.

---

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BAGS_API_KEY` | yes | — | From [dev.bags.fm](https://dev.bags.fm) |
| `BAGS_NETWORK` | no | `devnet` | `devnet` or `mainnet`. Writes need mainnet. |
| `SOLANA_RPC_URL` | no | public cluster RPC | Must agree with `BAGS_NETWORK` or the server refuses to start |
| `BAGS_KEYPAIR_PATH` | writes only | `~/.config/bags/keypair.json` | JSON byte-array keypair file |
| `BOS_TOKEN_MINT` | writes only | — | Gating token mint |
| `BOS_REQUIRED_BALANCE` | no | `10000` | Minimum gating-token balance |
| `BAGS_MAX_SOL_PER_TX` | no | `0.1` | Per-transaction spend cap |
| `BAGS_MAX_SOL_PER_SESSION` | no | `1.0` | Per-process spend cap |
| `BAGS_ALLOW_UNCONFIRMED` | no | `false` | Skip the confirmation step |

---

## Security

Read [SECURITY.md](.github/SECURITY.md) before pointing a funded wallet at this.

Summary: your private key is read from disk, used to sign, and never logged,
never sent anywhere, and never placed in an error message. Tool errors return
a message only — no stack traces — with key-shaped strings redacted. The startup
report strips credentials from the RPC URL. If the RPC endpoint's cluster
disagrees with `BAGS_NETWORK`, the server refuses to start rather than sign
mainnet transactions under a devnet banner.

Report vulnerabilities via
[GitHub security advisories](https://github.com/edycutjong/bagos/security/advisories/new).

---

## Development

```bash
npm ci
npm run ci            # lint + typecheck + tests with coverage
npm run dev           # stdio server with watch
npm run inspector     # MCP Inspector against the built server
npm run proof:devnet  # land a real devnet transaction through the write path
```

`proof:devnet` generates a throwaway keypair, funds it from the devnet faucet,
and pushes a transfer through the same simulate/sign/send/confirm path the write
tools use — then re-fetches the signature from the chain instead of trusting the
function's return value. Use it to verify the execution layer end to end.

144 tests. The bypass tests around the spend caps and the confirmation step are
load-bearing; treat a change there as a security change.

---

## Examples

See [docs/examples.md](docs/examples.md) for prompts you can type at your
assistant and what each should do.

## License

MIT — see [LICENSE](LICENSE).
