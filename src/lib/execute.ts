import {
  SendTransactionError,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { getConnection, explorerUrl } from './network.js';
// explorerUrl is still used for the successful-result link.

/**
 * Sign → simulate → send → confirm.
 *
 * Every write tool goes through here. The contract is deliberately narrow:
 * these functions either return a CONFIRMED on-chain signature, or they throw.
 * They never report success for a transaction that did not land.
 *
 * Exported as an object (matching Wallet / TokenGate / BagsClient) so tests can
 * jest.spyOn it, and so internal calls route through the same seam.
 */

export interface BlockhashContext {
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface ExecutionResult {
  signature: string;
  explorer: string;
  slot: number | null;
}

export class SimulationError extends Error {
  constructor(message: string, readonly logs: string[] | null) {
    super(message);
    this.name = 'SimulationError';
  }
}

/**
 * SOL a write may cost beyond the amount it declared: the network fee, a
 * priority fee, a platform fee, and rent for accounts the transaction opens
 * (an associated token account is about 0.00204 SOL). Fixed rather than a
 * percentage, so it does not grow with the size of a trade.
 */
export const FEE_ALLOWANCE_SOL = 0.01;

/**
 * The caps are checked against the amount a tool was asked to spend, but the
 * transaction that gets signed is built by the Bags API. This is thrown when
 * simulating that transaction shows more SOL leaving the wallet than was
 * approved plus FEE_ALLOWANCE_SOL, or when the simulation does not report the
 * wallet's balance and the amount cannot be checked at all.
 */
export class OutflowExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutflowExceededError';
  }
}

/** Upper bound on the SOL a simulated transaction may take from `payer`. */
export interface OutflowBound {
  payer: PublicKey;
  maxOutflowSol: number;
}

export class ConfirmationFailedError extends Error {
  constructor(message: string, readonly signature: string) {
    super(message);
    this.name = 'ConfirmationFailedError';
  }
}

/**
 * The transaction was sent, but we never learned whether it landed: the
 * confirmation call itself threw (timeout, expired block height, RPC error).
 * It may still confirm. Callers must treat the spend as possibly made.
 */
export class ConfirmationUnknownError extends Error {
  constructor(message: string, readonly signature: string) {
    super(message);
    this.name = 'ConfirmationUnknownError';
  }
}

/**
 * The fee payer's signature, read off the signed transaction before it is
 * sent. It is the transaction id, so it is known locally the moment signing
 * finishes; losing it because the send call threw is what left an operator
 * unable to check whether a "failed" trade had in fact landed.
 */
function localSignature(tx: Transaction | VersionedTransaction): string | null {
  const raw = isVersioned(tx) ? tx.signatures?.[0] : tx.signature;
  return raw ? bs58.encode(raw) : null;
}

/**
 * RPC answers to sendTransaction that prove the transaction was never
 * forwarded to a leader: preflight simulation failed (which includes
 * "Blockhash not found"), signature verification failed, or the bytes did
 * not decode. web3.js folds every JSON-RPC error into SendTransactionError
 * and drops the numeric code, so the message is all there is to go on.
 *
 * Anything else, including -32603 internal errors, "node is behind", and an
 * HTTP 5xx or 429 from a proxy in front of the node, can arrive after the
 * node already forwarded the bytes. Those are unknown, not failures.
 * Unknown costs budget; misclassifying a landed trade as failed costs funds.
 */
const DEFINITE_SEND_REJECTIONS = [
  /^Transaction simulation failed/i,
  /^Transaction signature verification failure/i,
  /^invalid transaction/i,
];

/**
 * Preflight reports a duplicate as a simulation failure, but it means the
 * transaction already LANDED. It happens when the same signed bytes are sent
 * twice, which web3.js's own retry on 429 can do. Never refund that.
 */
const LANDED_DESPITE_ERROR = /already been processed/i;

export function isDefiniteSendRejection(error: unknown): boolean {
  if (!(error instanceof SendTransactionError)) return false;
  const message = error.transactionError.message;
  if (LANDED_DESPITE_ERROR.test(message)) return false;
  return DEFINITE_SEND_REJECTIONS.some((re) => re.test(message));
}

function isVersioned(
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction {
  return 'message' in tx && !('instructions' in tx);
}

/**
 * Compare the wallet's balance before a simulated transaction with the balance
 * the simulation reports after it. No reported balance fails closed: a
 * transaction whose cost cannot be checked is not signed. A null account is
 * not "unknown" — the simulation left the wallet empty, so the system program
 * removed it — and counts as the whole balance leaving.
 */
function assertOutflowWithin(
  bound: OutflowBound,
  beforeLamports: number,
  accounts: ReadonlyArray<{ lamports: number } | null> | null | undefined
): void {
  const after = accounts?.[0];
  if (after === undefined) {
    throw new OutflowExceededError(
      `Refusing to sign: the simulation did not report the wallet's balance, so the SOL ` +
        `this transaction would move could not be checked. Nothing was signed.`
    );
  }
  const outflow = beforeLamports - (after?.lamports ?? 0);
  const max = Math.round(bound.maxOutflowSol * LAMPORTS_PER_SOL);
  if (outflow > max) {
    throw new OutflowExceededError(
      `Refusing to sign: simulating this transaction shows ${outflow / LAMPORTS_PER_SOL} SOL ` +
        `leaving the wallet, more than the ${max / LAMPORTS_PER_SOL} SOL allowed (the approved ` +
        `amount plus ${FEE_ALLOWANCE_SOL} SOL for fees and rent). Nothing was signed.`
    );
  }
}

export const Executor = {
  /**
   * Simulate before signing. A failed simulation aborts the write — the cheap
   * check that stops a malformed or under-funded transaction being submitted.
   *
   * It also reads the wallet's balance, asks the simulation for the wallet's
   * balance afterwards, and refuses if the difference is more than
   * `bound.maxOutflowSol`. That is what ties the spend caps to the bytes being
   * signed rather than to the arguments the tool was called with. The bound is
   * required, so no transaction reaches signing without that check.
   */
  simulate: async function (
    tx: Transaction | VersionedTransaction,
    bound: OutflowBound
  ): Promise<string[] | null> {
    const connection = getConnection();
    const before = await connection.getBalance(bound.payer, 'confirmed');

    const result = isVersioned(tx)
      ? await connection.simulateTransaction(tx, {
          sigVerify: false,
          accounts: { encoding: 'base64', addresses: [bound.payer.toBase58()] },
        })
      : await connection.simulateTransaction(tx, undefined, [bound.payer]);

    if (result.value.err) {
      throw new SimulationError(
        `Transaction simulation failed: ${JSON.stringify(result.value.err)}`,
        result.value.logs ?? null
      );
    }
    assertOutflowWithin(bound, before, result.value.accounts);
    return result.value.logs ?? null;
  },

  /**
   * Sign, submit, and wait for confirmation. Returns only once the network has
   * confirmed the signature.
   */
  signSendConfirm: async function (
    tx: Transaction | VersionedTransaction,
    keypair: Keypair,
    ctx?: BlockhashContext
  ): Promise<ExecutionResult> {
    const connection = getConnection();
    // Sign exactly what was prepared and simulated. An earlier version
    // re-fetched a blockhash here and overwrote prepare()'s, so the bytes that
    // were simulated were not the bytes that were signed and sent.
    const context = ctx ?? (await Executor.prepare(tx, keypair));

    if (isVersioned(tx)) {
      tx.sign([keypair]);
    } else {
      tx.sign(keypair);
    }

    const signedId = localSignature(tx);
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (error) {
      // Only a pre-forward rejection is a definite failure. Everything else
      // (timeouts, dropped connections, 5xx/429, internal errors) may have
      // happened after the node accepted the bytes: the outcome is unknown.
      if (isDefiniteSendRejection(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      const id = signedId ?? 'unknown';
      throw new ConfirmationUnknownError(
        `Sending transaction ${id} failed mid-flight (${reason}). It may still land. ` +
          (signedId
            ? `Check it on an explorer before retrying: ${explorerUrl(signedId)}`
            : `Check the wallet's recent transactions before retrying.`),
        id
      );
    }

    let confirmation: Awaited<ReturnType<typeof connection.confirmTransaction>>;
    try {
      confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: context.blockhash,
          lastValidBlockHeight: context.lastValidBlockHeight,
        },
        'confirmed'
      );
    } catch (error) {
      // Past this point the bytes are on the wire. An exception here says
      // nothing about whether they landed, so say that, with the signature.
      const reason = error instanceof Error ? error.message : String(error);
      throw new ConfirmationUnknownError(
        `Transaction ${signature} was sent but its outcome is unknown (${reason}). ` +
          `It may still land. Check it on an explorer before retrying: ${explorerUrl(signature)}`,
        signature
      );
    }

    if (confirmation.value.err) {
      throw new ConfirmationFailedError(
        `Transaction was submitted but failed on chain: ${JSON.stringify(
          confirmation.value.err
        )}.`,
        signature
      );
    }

    return {
      signature,
      explorer: explorerUrl(signature),
      slot: confirmation.context?.slot ?? null,
    };
  },

  /**
   * A legacy Transaction cannot be compiled — and therefore cannot be
   * simulated — until it has a feePayer and a recentBlockhash. Simulating
   * first threw "Transaction fee payer required" on any freshly built legacy
   * transaction, which made the whole simulate-before-send guarantee
   * unreachable on that path.
   */
  prepare: async function (
    tx: Transaction | VersionedTransaction,
    keypair: Keypair
  ): Promise<BlockhashContext> {
    const latest = await getConnection().getLatestBlockhash('confirmed');

    if (isVersioned(tx)) {
      // The message already carries the blockhash the SDK built against.
      // Confirm against THAT, not a fresher one, or a transaction that landed
      // can be reported as expired.
      return {
        blockhash: tx.message.recentBlockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      };
    }

    if (!tx.feePayer) tx.feePayer = keypair.publicKey;
    if (!tx.recentBlockhash) tx.recentBlockhash = latest.blockhash;
    return {
      blockhash: tx.recentBlockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    };
  },

  /**
   * Prepare, simulate, then sign/send/confirm. The full write path.
   *
   * `declaredSol` is the SOL the caller approved and reserved against the
   * caps. The simulation must not show the wallet losing more than that plus
   * FEE_ALLOWANCE_SOL. The default of 0 means the write should cost fees only.
   */
  executeTransaction: async function (
    tx: Transaction | VersionedTransaction,
    keypair: Keypair,
    declaredSol: number = 0
  ): Promise<ExecutionResult> {
    const context = await Executor.prepare(tx, keypair);
    await Executor.simulate(tx, {
      payer: keypair.publicKey,
      maxOutflowSol: declaredSol + FEE_ALLOWANCE_SOL,
    });
    return Executor.signSendConfirm(tx, keypair, context);
  },

  /**
   * Execute several transactions in order, stopping at the first failure.
   * Returns what actually landed — partial success is reported honestly rather
   * than collapsed into a single "done". Used for fee claims, which should
   * cost only fees, so each transaction gets the fees-only bound.
   */
  executeAll: async function (
    txs: Array<Transaction | VersionedTransaction>,
    keypair: Keypair
  ): Promise<{ executed: ExecutionResult[]; failedAt: number | null; error: Error | null }> {
    const executed: ExecutionResult[] = [];
    for (let i = 0; i < txs.length; i++) {
      try {
        executed.push(await Executor.executeTransaction(txs[i]!, keypair));
      } catch (err) {
        return { executed, failedAt: i, error: err as Error };
      }
    }
    return { executed, failedAt: null, error: null };
  },
};
