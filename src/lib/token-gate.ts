import { Connection, PublicKey } from '@solana/web3.js';

export async function checkTokenGate(
  walletAddress: string,
): Promise<{ allowed: boolean; balance: number }> {
  // Graceful fallback for development if BOS_TOKEN_MINT isn't explicitly set yet
  // but architecture says it's required. Let's make it throw if undefined.
  if (!process.env.BOS_TOKEN_MINT) {
    throw new Error('BOS_TOKEN_MINT is not defined in environment variables');
  }

  const bosMint = new PublicKey(process.env.BOS_TOKEN_MINT);
  const requiredBalance = Number(process.env.BOS_REQUIRED_BALANCE) || 10000;
  
  const hRpcUrl = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(hRpcUrl, 'confirmed');

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
