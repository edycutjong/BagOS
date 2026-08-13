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
 * these functions either return a CONFIRMED on-chain signature, or they throw.
 * They never report success for a transaction that did not land.
 *
 * Exported as an object (matching Wallet / TokenGate / BagsClient) so tests can
 * jest.spyOn it, and so internal calls route through the same seam.
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

export const Executor = {
  /**
   * Simulate before signing. A failed simulation aborts the write — the cheap
   * check that stops a malformed or under-funded transaction being submitted.
   */
  simulate: async function (
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
  },

  /**
   * Sign, submit, and wait for confirmation. Returns only once the network has
   * confirmed the signature.
   */
  signSendConfirm: async function (
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

    const signature = await connection.sendRawTransaction(tx.serialize(), {
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
  },

  /** Simulate, then sign/send/confirm. The full write path. */
  executeTransaction: async function (
    tx: Transaction | VersionedTransaction,
    keypair: Keypair
  ): Promise<ExecutionResult> {
    await Executor.simulate(tx);
    return Executor.signSendConfirm(tx, keypair);
  },

  /**
   * Execute several transactions in order, stopping at the first failure.
   * Returns what actually landed — partial success is reported honestly rather
   * than collapsed into a single "done".
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
