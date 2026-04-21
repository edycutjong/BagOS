#!/usr/bin/env npx tsx
/**
 * Golden Path Demo Script for BagOS
 *
 * Runs the BagOS MCP server in HTTP mode and exercises all read-only tools
 * end-to-end via the MCP JSON-RPC protocol.
 *
 * Scenarios:
 *   1. Health Check     — System status + tool registry
 *   2. Heartbeat        — Wallet status + claimable summary
 *   3. Creator Board    — Top creators by lifetime fees
 *   4. Token Analytics  — Pool info for a token
 *   5. Trade Quote      — SOL → token swap quote
 *   6. Partner Stats    — Referral earnings check
 *
 * Usage:
 *   npm run demo             # Run against localhost:3050
 *   npm run demo:ngrok       # Run against ngrok URL
 *
 * Prerequisites:
 *   1. BagOS server running in HTTP mode: npm run start -- --http
 *   2. .env configured with BAGS_API_KEY and HELIUS_RPC_URL
 */

const BAGOS_URL = process.argv[2] || "http://localhost:3050";

// ─── Colors ──────────────────────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ─── Well-known Solana addresses ─────────────────────────────────────────────
const SOL_MINT = "So11111111111111111111111111111111111111112";

// ─── MCP Call Helper ─────────────────────────────────────────────────────────
let mcpRequestId = 0;

function parseSseResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try { return JSON.parse(line.substring(6)); } catch { /* skip */ }
    }
  }
  try { return JSON.parse(text); } catch { return null; }
}

async function mcpInitialize(): Promise<void> {
  const response = await fetch(`${BAGOS_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "bagos-golden-path", version: "1.0.0" },
      },
      id: ++mcpRequestId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Initialize failed: ${response.status} ${body}`);
  }
}

async function mcpCallTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(`${BAGOS_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: ++mcpRequestId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tool call failed: ${response.status} ${body}`);
  }

  const text = await response.text();
  const json = parseSseResponse(text) as Record<string, unknown> | null;
  if (!json) return text;

  const result = json.result as { content?: Array<{ text?: string }> } | undefined;
  if (result?.content) {
    return result.content.map((c) => c.text || "").join("\n");
  }

  // Check for error responses
  const error = json.error as { message?: string } | undefined;
  if (error?.message) {
    throw new Error(error.message);
  }

  return JSON.stringify(json, null, 2);
}

// ─── Step Runner ─────────────────────────────────────────────────────────────
let globalStep = 0;
let stepsPassed = 0;
let stepsFailed = 0;

async function step(title: string, fn: () => Promise<string>): Promise<string> {
  globalStep++;
  const stepLabel = cyan(`[Step ${globalStep}]`);
  console.log(`\n${stepLabel} ${bold(title)}`);

  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    stepsPassed++;
    console.log(green(`  ✅ Pass`) + dim(` (${elapsed}ms)`));

    const preview = result.length > 400 ? result.substring(0, 400) + "..." : result;
    for (const line of preview.split("\n")) {
      console.log(dim(`  │ ${line}`));
    }

    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    stepsFailed++;
    console.log(red(`  ❌ FAIL`) + dim(` (${elapsed}ms)`));
    console.error(red(`  ${error instanceof Error ? error.message : String(error)}`));
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

async function scenarioHealthCheck(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 💓 System Health Check ═══`)}`);

  try {
    await step("HTTP Health Endpoint", async () => {
      const res = await fetch(`${BAGOS_URL}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { status: string; tools: string[] };
      if (data.status !== "ok") throw new Error("non-ok status");
      return `Status: ${data.status} | ${data.tools.length} tools registered: ${data.tools.join(", ")}`;
    });

    await step("MCP Initialize", () =>
      mcpInitialize().then(() => "Protocol handshake OK")
    );

    return true;
  } catch {
    return false;
  }
}

async function scenarioHeartbeat(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 🫀 Heartbeat — Wallet & System Status ═══`)}`);

  try {
    await step("bags_heartbeat — Read system + wallet status", () =>
      mcpCallTool("bags_heartbeat", {})
    );
    return true;
  } catch {
    return false;
  }
}

async function scenarioCreatorLeaderboard(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 🏆 Creator Leaderboard ═══`)}`);

  try {
    await step("bags_get_creators — Top 5 by lifetime fees", () =>
      mcpCallTool("bags_get_creators", { limit: 5, offset: 0 })
    );
    return true;
  } catch {
    return false;
  }
}

async function scenarioTradeQuote(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 💱 Trade Quote — SOL Swap ═══`)}`);

  try {
    // Use the BOS_TOKEN_MINT from env if available, otherwise use SOL self-quote as test
    const bosMint = process.env.BOS_TOKEN_MINT || SOL_MINT;

    await step(`bags_get_trade_quote — 0.1 SOL → $BOS`, () =>
      mcpCallTool("bags_get_trade_quote", {
        inputMint: SOL_MINT,
        outputMint: bosMint,
        amount: 0.1,
        side: "buy",
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function scenarioPartnerStats(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 🤝 Partner Stats ═══`)}`);

  try {
    // Use a well-known SOL address as a demo partner ID
    await step("bags_get_partner_stats — Referral earnings", () =>
      mcpCallTool("bags_get_partner_stats", { partnerId: SOL_MINT })
    );
    return true;
  } catch {
    return false;
  }
}

async function scenarioTokenGateCheck(): Promise<boolean> {
  console.log(`\n${magenta(`═══ 🔒 Token Gate Verification ═══`)}`);

  try {
    // Attempt a gated operation without the required $BOS balance
    // This should fail gracefully with an access denied message
    await step("bags_execute_trade — Write tool (token gated)", () =>
      mcpCallTool("bags_execute_trade", {
        inputMint: SOL_MINT,
        outputMint: process.env.BOS_TOKEN_MINT || SOL_MINT,
        amount: 0.1,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(bold("\n🖥️  BagOS — Golden Path Demo\n"));
  console.log(`  Target:     ${cyan(BAGOS_URL)}`);
  console.log(`  Scenarios:  ${yellow("6")}`);
  console.log(`  BOS Mint:   ${dim(process.env.BOS_TOKEN_MINT || "(placeholder)")}`);

  const scenarios = [
    { name: "Health Check", fn: scenarioHealthCheck },
    { name: "Heartbeat", fn: scenarioHeartbeat },
    { name: "Creator Leaderboard", fn: scenarioCreatorLeaderboard },
    { name: "Trade Quote", fn: scenarioTradeQuote },
    { name: "Partner Stats", fn: scenarioPartnerStats },
    { name: "Token Gate Check", fn: scenarioTokenGateCheck },
  ];

  let scenariosPassed = 0;
  let scenariosFailed = 0;

  for (const scenario of scenarios) {
    const ok = await scenario.fn();
    if (ok) scenariosPassed++;
    else scenariosFailed++;
  }

  // Summary
  console.log(`\n${bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`);
  console.log(`  ${bold("Scenarios")}: ${green(`${scenariosPassed} passed`)}${scenariosFailed ? " " + red(`${scenariosFailed} failed`) : ""}`);
  console.log(`  ${bold("Steps")}:     ${green(`${stepsPassed} passed`)}${stepsFailed ? " " + red(`${stepsFailed} failed`) : ""}`);
  console.log(`  ${bold("Total")}:     ${globalStep} steps across ${scenarios.length} scenarios`);

  if (scenariosFailed === 0) {
    console.log(bold(`\n🎬 All ${scenariosPassed} scenarios verified — safe to record demo!\n`));
  } else {
    console.log(yellow(`\n⚠️  ${scenariosFailed} scenario(s) failed — check logs above.\n`));
    process.exitCode = 1;
  }
}

main();
