import * as fs from 'fs';
import * as path from 'path';
import { getNetwork, redactedRpcUrl } from './network.js';
import { maxSolPerTx, maxSolPerSession, confirmationRequired } from './guards.js';

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

  // --- required for every tool ---
  if (process.env['BAGS_API_KEY']) {
    lines.push('  [ok]   BAGS_API_KEY               set');
  } else {
    lines.push('  [FAIL] BAGS_API_KEY               missing — get one at https://dev.bags.fm');
    fatal = true;
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
