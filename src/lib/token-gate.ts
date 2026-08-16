import { PublicKey } from '@solana/web3.js';
import { getConnection } from './network.js';
import { numFromEnv } from './env.js';

const DEFAULT_REQUIRED_BALANCE = 10000;

/**
 * The gate's minimum balance.
 *
 * Exported so preflight can evaluate it at startup: a bad value should be
 * reported when the server boots, not discovered by the first write that trips
 * over it.
 *
 * Previously `Number(env) || DEFAULT`, which fails open twice — see env.ts.
 * Briefly: 0 is a legitimate value meaning "no minimum", and it is falsy, so
 * asking for no gate produced the default gate; and a non-numeric value was
 * silently swallowed into the default rather than reported.
 */
export function requiredBalance(): number {
  return numFromEnv('BOS_REQUIRED_BALANCE', DEFAULT_REQUIRED_BALANCE);
}

export const TokenGate = {
  checkTokenGate: async function(
    walletAddress: string,
  ): Promise<{ allowed: boolean; balance: number }> {
    const mint = process.env['BOS_TOKEN_MINT'];
    if (!mint) {
      throw new Error(
        'BOS_TOKEN_MINT is not set. Write tools are gated on holding this token.'
      );
    }

    const bosMint = new PublicKey(mint);
    const required = requiredBalance();

    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: bosMint,
    });

    const balance = accounts.value.reduce((sum, acc) => {
      const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
      return sum + (amount || 0);
    }, 0);

    return { allowed: balance >= required, balance };
  }
};
