# 🖥️ BagOS — The AI Operating System for Creator Finance

> Claude MCP server that turns natural language into Bags token launches, trades, and fee claims.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Bags SDK](https://img.shields.io/badge/Bags_SDK-v1.3.7-blue.svg)](https://docs.bags.fm/)
[![MCP](https://img.shields.io/badge/MCP-v1.25-purple.svg)](https://modelcontextprotocol.io/)

## What is BagOS?

BagOS is the first Model Context Protocol (MCP) server for Solana DeFi. It registers 10+ native tools into Claude Desktop, letting you manage your entire Bags creator economy through natural language.

**No dashboards. No tab-switching. Just type what you want.**

## Quick Start

### 1. Install
```bash
git clone https://github.com/edycutjong/bagos.git
cd bagos && npm install
```

### 2. Configure
```bash
cp .env.example .env
# Add your BAGS_API_KEY and HELIUS_RPC_URL
```

### 3. Add to Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bagos": {
      "command": "npx",
      "args": ["tsx", "/path/to/bagos/src/index.ts"]
    }
  }
}
```

### 4. Restart Claude Desktop

## Tools

| Tool | Description | Token-Gated |
|------|-------------|:-----------:|
| `bags_authenticate` | V2 wallet authentication | No |
| `bags_get_claimable_fees` | Discover claimable positions | No |
| `bags_claim_fees` | Claim pending fees | ✅ |
| `bags_get_trade_quote` | Get swap quotes | No |
| `bags_execute_trade` | Execute token swaps | ✅ |
| `bags_launch_token` | Launch a new token | ✅ |
| `bags_get_creators` | Top creators leaderboard | No |
| `bags_get_token_analytics` | Token pool & claim stats | No |
| `bags_get_partner_stats` | Partner referral earnings | No |
| `bags_heartbeat` | Health check & summary | No |

## $BOS Token

$BOS is the access key for BagOS write operations. Hold ≥10,000 $BOS to unlock trades, claims, and token launches.

- **Mint**: `[CONTRACT_ADDRESS]`
- **Trade on Bags.fm**: [bags.fm/BOS](https://bags.fm/)

## Tech Stack

- **MCP**: `@modelcontextprotocol/sdk` v1.25+
- **Bags**: `@bagsfm/bags-sdk` v1.3.7+
- **Solana**: `@solana/web3.js` + `tweetnacl` + `bs58`
- **Validation**: `zod` v4
- **Runtime**: Node.js 22 + TypeScript

## License

MIT

## Built for [The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon)

Track: Claude Skills | Token: $BOS | By: [@edycutjong](https://x.com/edycutjong)
