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

/**
 * Infer the cluster an RPC endpoint actually points at, when the URL says so.
 * Returns null for endpoints that carry no cluster hint (localhost, private
 * gateways) — those are taken on trust.
 */
export function clusterFromUrl(url: string): BagsNetwork | null {
  const u = url.toLowerCase();
  if (u.includes('devnet')) return 'devnet';
  if (u.includes('testnet')) return null;
  if (u.includes('mainnet')) return 'mainnet';
  return null;
}

export function getRpcUrl(): string {
  const explicit = process.env['SOLANA_RPC_URL'] || process.env['HELIUS_RPC_URL'];
  if (explicit) {
    // A custom endpoint that disagrees with BAGS_NETWORK is how you end up
    // signing mainnet transactions under a "devnet" banner. Refuse rather
    // than pick a winner.
    const declared = getNetwork();
    const actual = clusterFromUrl(explicit);
    if (actual && actual !== declared) {
      throw new Error(
        `Network mismatch: BAGS_NETWORK is "${declared}" but the configured RPC ` +
          `endpoint points at ${actual}. Set BAGS_NETWORK=${actual}, or point ` +
          `SOLANA_RPC_URL at a ${declared} endpoint.`
      );
    }
    return explicit;
  }
  return getNetwork() === 'mainnet'
    ? clusterApiUrl('mainnet-beta')
    : clusterApiUrl('devnet');
}

/** RPC endpoint with any credentials stripped, for logs and error messages. */
export function redactedRpcUrl(): string {
  const raw = getRpcUrl();
  try {
    const url = new URL(raw);
    if ([...url.searchParams.keys()].length > 0) {
      for (const key of [...url.searchParams.keys()]) {
        url.searchParams.set(key, 'REDACTED');
      }
    }
    if (url.username || url.password) {
      url.username = 'REDACTED';
      url.password = '';
    }
    return url.toString();
  } catch {
    return '[unparseable RPC URL]';
  }
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
