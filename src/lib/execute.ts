import {
  Keypair,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { getConnection, explorerUrl } from './network.js';

/**
 * Sign → simulate → send → confirm.
 *
 * Every write tool goes through here. The contract is deliberately narrow:
 * this function either returns a CONFIRMED on-chain signature, or it throws.
 * It never reports success for a transaction it did not land.
 */

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

export class ConfirmationFailedError extends Error {
  constructor(message: string, readonly signature: string) {
    super(message);
    this.name = 'ConfirmationFailedError';
  }
}

function isVersioned(
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction {
  return 'message' in tx && !('instructions' in tx);
}

/**
 * Simulate before signing. A failed simulation aborts the write — this is the
 * cheap check that stops a malformed or under-funded transaction from ever
 * being submitted.
 */
export async function simulate(
  tx: Transaction | VersionedTransaction
): Promise<string[] | null> {
  const connection = getConnection();

  const result = isVersioned(tx)
    ? await connection.simulateTransaction(tx, { sigVerify: false })
    : await connection.simulateTransaction(tx);

  if (result.value.err) {
    throw new SimulationError(
      `Transaction simulation failed: ${JSON.stringify(result.value.err)}`,
      result.value.logs ?? null
    );
  }
  return result.value.logs ?? null;
}

/**
 * Sign, submit, and wait for confirmation. Returns only once the network has
 * confirmed the signature.
 */
export async function signSendConfirm(
  tx: Transaction | VersionedTransaction,
  keypair: Keypair
): Promise<ExecutionResult> {
  const connection = getConnection();
  const latest = await connection.getLatestBlockhash('confirmed');

  if (isVersioned(tx)) {
    tx.sign([keypair]);
  } else {
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.sign(keypair);
  }

  const raw = tx.serialize();
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  if (confirmation.value.err) {
    throw new ConfirmationFailedError(
      `Transaction was submitted but failed on chain: ${JSON.stringify(
        confirmation.value.err
      )}. Inspect it at ${explorerUrl(signature)}`,
      signature
    );
  }

  return {
    signature,
    explorer: explorerUrl(signature),
    slot: confirmation.context?.slot ?? null,
  };
}

/** Simulate, then sign/send/confirm. The full write path. */
export async function executeTransaction(
  tx: Transaction | VersionedTransaction,
  keypair: Keypair
): Promise<ExecutionResult> {
  await simulate(tx);
  return signSendConfirm(tx, keypair);
}

/**
 * Execute several transactions in order, stopping at the first failure.
 * Returns what actually landed — partial success is reported honestly rather
 * than collapsed into a single "done".
 */
export async function executeAll(
  txs: Array<Transaction | VersionedTransaction>,
  keypair: Keypair
): Promise<{ executed: ExecutionResult[]; failedAt: number | null; error: Error | null }> {
  const executed: ExecutionResult[] = [];
  for (let i = 0; i < txs.length; i++) {
    try {
      executed.push(await executeTransaction(txs[i]!, keypair));
    } catch (err) {
      return { executed, failedAt: i, error: err as Error };
    }
  }
  return { executed, failedAt: null, error: null };
}
