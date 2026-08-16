import { createHash, randomBytes } from 'crypto';
import { isMainnet } from './network.js';
import { numFromEnv } from './env.js';

/**
 * Spend guards for write tools.
 *
 * Two independent limits, both denominated in SOL:
 *   - per transaction  (BAGS_MAX_SOL_PER_TX,      default 0.1)
 *   - per session      (BAGS_MAX_SOL_PER_SESSION, default 1.0)
 *
 * "Session" means one server process. The counter is in-memory and resets on
 * restart, which is the correct scope for a stdio MCP server: one client
 * connection, one process.
 */

const DEFAULT_MAX_PER_TX = 0.1;
const DEFAULT_MAX_PER_SESSION = 1.0;

let sessionSpendSol = 0;


export function maxSolPerTx(): number {
  return numFromEnv('BAGS_MAX_SOL_PER_TX', DEFAULT_MAX_PER_TX);
}

export function maxSolPerSession(): number {
  return numFromEnv('BAGS_MAX_SOL_PER_SESSION', DEFAULT_MAX_PER_SESSION);
}

export function sessionSpend(): number {
  return sessionSpendSol;
}

/** Test seam. */
export function resetGuards(): void {
  sessionSpendSol = 0;
  pending.clear();
}

export class SpendCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpendCapError';
  }
}

/**
 * Throws unless `amountSol` fits inside BOTH caps. Call before signing —
 * never after. Does not mutate the session counter.
 */
export function assertWithinCaps(amountSol: number): void {
  if (!Number.isFinite(amountSol) || amountSol < 0) {
    throw new SpendCapError(`Refusing to spend a non-finite amount (${amountSol}).`);
  }
  const perTx = maxSolPerTx();
  if (amountSol > perTx) {
    throw new SpendCapError(
      `Per-transaction cap exceeded: ${amountSol} SOL > ${perTx} SOL. ` +
        `Raise BAGS_MAX_SOL_PER_TX to allow this.`
    );
  }
  const perSession = maxSolPerSession();
  if (sessionSpendSol + amountSol > perSession) {
    throw new SpendCapError(
      `Session cap exceeded: ${sessionSpendSol} SOL already spent, ` +
        `${amountSol} SOL requested, cap is ${perSession} SOL. ` +
        `Raise BAGS_MAX_SOL_PER_SESSION or restart the server.`
    );
  }
}

/** Record a spend only after the transaction is confirmed on chain. */
export function recordSpend(amountSol: number): void {
  sessionSpendSol += amountSol;
}

export class UncappableSpendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UncappableSpendError';
  }
}

export function allowUncappedTokenSwaps(): boolean {
  return (process.env['BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS'] || 'false').toLowerCase() === 'true';
}

/**
 * The caps are denominated in SOL, so they can only bind when SOL is what
 * leaves the wallet. A token-input swap disposes of an asset this module has
 * no way to value, and an earlier version of this code silently treated that
 * as a 0 SOL spend: every cap passed, and the confirmation preview displayed
 * "Spend: 0 SOL" for a trade that could empty a token balance.
 *
 * Refuse rather than pretend. Opting in with BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS
 * is allowed, but the preview then says plainly that no cap applies.
 */
export function assertSpendIsCappable(inputMint: string, solMint: string): void {
  if (inputMint === solMint) return;
  if (allowUncappedTokenSwaps()) return;
  throw new UncappableSpendError(
    `This swap spends ${inputMint}, not SOL. The spend caps are ` +
      `SOL-denominated and cannot value an arbitrary token, so this trade ` +
      `would be completely uncapped. Set BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true ` +
      `to permit token-input swaps, understanding that neither ` +
      `BAGS_MAX_SOL_PER_TX nor BAGS_MAX_SOL_PER_SESSION will limit them.`
  );
}

/* ------------------------------------------------------------------ */
/* Two-step confirmation                                               */
/* ------------------------------------------------------------------ */

interface PendingAction {
  fingerprint: string;
  /** null = not SOL-denominated, so the caps never applied to it. */
  amountSol: number | null;
  createdAt: number;
}

const pending = new Map<string, PendingAction>();
const TOKEN_TTL_MS = 5 * 60 * 1000;

export function confirmationRequired(): boolean {
  return (process.env['BAGS_ALLOW_UNCONFIRMED'] || 'false').toLowerCase() !== 'true';
}

/**
 * Fingerprint the exact action being confirmed. A token is only valid for the
 * same tool + same arguments, so a caller cannot obtain a token for a 0.01 SOL
 * swap and reuse it to authorize a 10 SOL one.
 */
export function fingerprint(toolName: string, args: unknown): string {
  return createHash('sha256')
    .update(toolName)
    .update(' ')
    .update(JSON.stringify(args ?? null))
    .digest('hex')
    .slice(0, 32);
}

export function issueToken(toolName: string, args: unknown, amountSol: number | null): string {
  const token = randomBytes(9).toString('base64url');
  pending.set(token, {
    fingerprint: fingerprint(toolName, args),
    amountSol,
    createdAt: Date.now(),
  });
  return token;
}

export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

/**
 * Single-use. Throws if the token is unknown, expired, or was issued for a
 * different action. Consumed on every outcome so a token can never be replayed.
 */
export function consumeToken(token: string, toolName: string, args: unknown): void {
  const entry = pending.get(token);
  if (!entry) {
    throw new ConfirmationError('Unknown or already-used confirmation token.');
  }
  pending.delete(token);

  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    throw new ConfirmationError('Confirmation token expired. Request a new preview.');
  }
  if (entry.fingerprint !== fingerprint(toolName, args)) {
    throw new ConfirmationError(
      'Confirmation token does not match these arguments. ' +
        'Tokens authorize one exact action.'
    );
  }
}

/**
 * The preview block shown before a write executes.
 *
 * `amountSol: null` means the spend is NOT SOL-denominated and therefore not
 * covered by the caps. Say so loudly — displaying "Spend: 0 SOL" for a trade
 * that disposes of a token balance is worse than displaying nothing.
 */
export function previewText(opts: {
  action: string;
  amountSol: number | null;
  details: string[];
  token: string;
  toolName: string;
}): string {
  const capped = opts.amountSol !== null;
  const lines = [
    `⚠️  CONFIRMATION REQUIRED — nothing has been signed or sent.`,
    ``,
    `Action:  ${opts.action}`,
    ...opts.details.map((d) => `         ${d}`),
    ``,
    capped
      ? `Spend:   ${opts.amountSol} SOL`
      : `Spend:   NOT SOL-DENOMINATED — spend caps do not apply to this trade`,
    capped
      ? `Caps:    ${maxSolPerTx()} SOL/tx · ${sessionSpend()}/${maxSolPerSession()} SOL used this session`
      : `Caps:    ⚠️  UNCAPPED. Verify the amount above yourself.`,
  ];
  if (isMainnet()) {
    lines.push(``, `🔴 This is MAINNET. Confirming moves real funds.`);
  }
  lines.push(
    ``,
    `To execute, call ${opts.toolName} again with the identical arguments plus:`,
    `  confirm: "${opts.token}"`,
    ``,
    `Token is single-use and expires in 5 minutes.`
  );
  return lines.join('\n');
}
