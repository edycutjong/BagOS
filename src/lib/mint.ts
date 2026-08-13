import { PublicKey } from '@solana/web3.js';
import { getConnection } from './network.js';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9;

/**
 * Convert a human-readable amount into base units for a specific mint.
 *
 * This exists because the previous code did `Math.round(amount * 1e9)` for
 * every mint. That is only correct for 9-decimal tokens. USDC and most
 * pump-style mints are 6-decimal, so "swap 100" became 100,000 — a 1000x
 * overspend with no cap covering it.
 */

const decimalsCache = new Map<string, number>();

export function resetMintCache(): void {
  decimalsCache.clear();
}

export async function getMintDecimals(mint: string): Promise<number> {
  if (mint === SOL_MINT) return SOL_DECIMALS;

  const cached = decimalsCache.get(mint);
  if (cached !== undefined) return cached;

  const info = await getConnection().getParsedAccountInfo(new PublicKey(mint));
  const data = info.value?.data;

  if (!data || !('parsed' in data) || data.parsed?.info?.decimals === undefined) {
    throw new Error(
      `Could not read decimals for mint ${mint}. Refusing to guess an amount ` +
        `— an incorrect decimal assumption silently changes the trade size by ` +
        `orders of magnitude.`
    );
  }

  const decimals = Number(data.parsed.info.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Mint ${mint} reported implausible decimals: ${decimals}.`);
  }

  decimalsCache.set(mint, decimals);
  return decimals;
}

export async function toBaseUnits(amount: number, mint: string): Promise<number> {
  const decimals = await getMintDecimals(mint);
  const base = amount * Math.pow(10, decimals);
  if (!Number.isFinite(base)) {
    throw new Error(`Amount ${amount} is not representable for mint ${mint}.`);
  }
  if (base > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Amount ${amount} exceeds the safe integer range in base units for mint ${mint}.`
    );
  }
  return Math.round(base);
}
