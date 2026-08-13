import { PublicKey } from '@solana/web3.js';
import { getConnection } from './network.js';

const DEFAULT_REQUIRED_BALANCE = 10000;

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
    const requiredBalance = Number(process.env['BOS_REQUIRED_BALANCE']) || DEFAULT_REQUIRED_BALANCE;

    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: bosMint,
    });

    const balance = accounts.value.reduce((sum, acc) => {
      const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
      return sum + (amount || 0);
    }, 0);

    return { allowed: balance >= requiredBalance, balance };
  }
};
