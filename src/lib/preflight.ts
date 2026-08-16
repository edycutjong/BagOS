import * as fs from 'fs';
import * as path from 'path';
import { getNetwork, redactedRpcUrl } from './network.js';
import { maxSolPerTx, maxSolPerSession, confirmationRequired } from './guards.js';
import { requiredBalance } from './token-gate.js';

/**
 * Startup configuration check.
 *
 * Everything here writes to STDERR. On the stdio transport, stdout carries the
 * JSON-RPC stream — a single stray console.log corrupts the protocol and the
 * client reports an opaque parse failure.
 */

export interface PreflightReport {
  ok: boolean;
  lines: string[];
}

function resolveHome(p: string): string {
  if (!p.startsWith('~/')) return p;
  const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
  return path.join(home, p.slice(2));
}

export function preflight(): PreflightReport {
  const lines: string[] = [];
  let fatal = false;

  lines.push('BagOS MCP server — configuration');

  // --- required for every tool, but NOT fatal ---
  //
  // A missing key makes the server useless; it does not make it dangerous. Those
  // are different things, and only the second justifies refusing to start.
  //
  // Aborting here blinded every client that asks what this server offers before
  // being configured. An MCP client lists tools first and collects credentials
  // second, and a directory that indexes servers by launching them and calling
  // tools/list got nothing at all: Smithery listed BagOS with zero tools and
  // scored its entire capability section 0/40, not because the tools lack
  // descriptions — they have them — but because nothing could enumerate them.
  //
  // So: start, advertise all 14 tools, and let each call fail with a clear
  // message. Contrast the two cases below, which stay fatal because a wrong
  // cluster or an unparseable spend cap can move real money the wrong way.
  if (process.env['BAGS_API_KEY']) {
    lines.push('  [ok]   BAGS_API_KEY               set');
  } else {
    lines.push('  [WARN] BAGS_API_KEY               missing — tools are listed but every call will fail. Get one at https://dev.bags.fm');
  }

  // --- cluster ---
  let network: string;
  try {
    network = getNetwork();
    if (network === 'mainnet') {
      lines.push('  [WARN] BAGS_NETWORK               mainnet — writes move REAL funds');
    } else {
      lines.push('  [ok]   BAGS_NETWORK               devnet (default)');
    }
    lines.push(`  [ok]   RPC                        ${redactedRpcUrl()}`);
  } catch (err) {
    lines.push(`  [FAIL] network                    ${(err as Error).message}`);
    fatal = true;
  }

  // --- writes: optional, but half-configured is worth flagging ---
  const keyPath = process.env['BAGS_KEYPAIR_PATH'];
  if (!keyPath) {
    lines.push('  [--]   BAGS_KEYPAIR_PATH          unset — read-only tools available');
  } else if (fs.existsSync(resolveHome(keyPath))) {
    lines.push(`  [ok]   BAGS_KEYPAIR_PATH          ${keyPath}`);
  } else {
    lines.push(`  [WARN] BAGS_KEYPAIR_PATH          ${keyPath} does not exist — write tools will fail`);
  }

  if (process.env['BOS_TOKEN_MINT']) {
    lines.push('  [ok]   BOS_TOKEN_MINT             set');
  } else {
    lines.push('  [WARN] BOS_TOKEN_MINT             unset — write tools will fail their gate check');
  }

  // Evaluate the gate threshold at startup rather than at first write. An
  // unparseable BOS_REQUIRED_BALANCE used to be swallowed into the default, so
  // a typo produced a gate the operator never chose and never saw. Fatal for
  // the same reason the spend caps are: a limit nobody can parse is a limit
  // nobody is enforcing.
  try {
    const req = requiredBalance();
    lines.push(
      req === 0
        ? '  [WARN] BOS_REQUIRED_BALANCE        0 — token gate disabled, any balance passes'
        : `  [ok]   BOS_REQUIRED_BALANCE       ${req}`
    );
  } catch (err) {
    lines.push(`  [FAIL] BOS_REQUIRED_BALANCE       ${(err as Error).message}`);
    fatal = true;
  }

  // --- spend guards ---
  try {
    lines.push(`  [ok]   spend caps                 ${maxSolPerTx()} SOL/tx · ${maxSolPerSession()} SOL/session`);
  } catch (err) {
    lines.push(`  [FAIL] spend caps                 ${(err as Error).message}`);
    fatal = true;
  }

  if (confirmationRequired()) {
    lines.push('  [ok]   confirmation               required on all writes');
  } else {
    lines.push('  [WARN] confirmation               DISABLED via BAGS_ALLOW_UNCONFIRMED');
  }

  // Every other flag here changes what the server is ALLOWED to do. This one
  // changes what it SAYS: with it on, bags_get_claimable_fees returns invented
  // balances instead of querying the chain (see tools/GetClaimableFees.ts). A
  // preflight that reports the spend caps but stays silent about fabricated
  // balances tells the operator the least useful truth. [WARN], same as the
  // other footguns, because a mock left on in a real deployment reads as real.
  //
  // The test is `=== 'true'` and not a looser truthy check on purpose: it must
  // mirror GetClaimableFees exactly. If this said "ON" for USE_MOCK_DATA=1
  // while the tool still returned live data, the report would be lying in the
  // opposite direction.
  if (process.env['USE_MOCK_DATA'] === 'true') {
    lines.push('  [WARN] USE_MOCK_DATA              ON — bags_get_claimable_fees returns FABRICATED balances');
  } else {
    lines.push('  [ok]   USE_MOCK_DATA              off — tools report real data');
  }

  return { ok: !fatal, lines };
}

/** Print the report to stderr. Returns false if startup should abort. */
export function reportPreflight(): boolean {
  const { ok, lines } = preflight();
  for (const line of lines) console.error(line);
  if (!ok) {
    console.error('');
    console.error('Server not started: fix the [FAIL] items above.');
  }
  return ok;
}
