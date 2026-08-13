import { Connection, clusterApiUrl } from '@solana/web3.js';

export type BagsNetwork = 'devnet' | 'mainnet';

/**
 * Resolve the target cluster. Devnet is the default on purpose: this server
 * signs and submits transactions, so an unconfigured install must never be
 * pointed at mainnet by accident.
 */
export function getNetwork(): BagsNetwork {
  const raw = (process.env['BAGS_NETWORK'] || 'devnet').trim().toLowerCase();
  if (raw === 'mainnet' || raw === 'mainnet-beta') return 'mainnet';
  if (raw === 'devnet') return 'devnet';
  throw new Error(
    `BAGS_NETWORK must be "devnet" or "mainnet" (got "${raw}").`
  );
}

export function isMainnet(): boolean {
  return getNetwork() === 'mainnet';
}

export function getRpcUrl(): string {
  const explicit = process.env['SOLANA_RPC_URL'] || process.env['HELIUS_RPC_URL'];
  if (explicit) return explicit;
  return getNetwork() === 'mainnet'
    ? clusterApiUrl('mainnet-beta')
    : clusterApiUrl('devnet');
}

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(getRpcUrl(), 'confirmed');
  }
  return connection;
}

/** Test seam — drops the memoized connection. */
export function resetConnection(): void {
  connection = null;
}

export function explorerUrl(signature: string): string {
  const suffix = getNetwork() === 'mainnet' ? '' : '?cluster=devnet';
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

/** Prefix for every write-tool response so the operator always sees the cluster. */
export function networkBanner(): string {
  return getNetwork() === 'mainnet'
    ? '🔴 MAINNET — real funds'
    : '🧪 devnet — test funds';
}
