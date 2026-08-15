/**
 * Devnet proof: land a real transaction through the production write path.
 *
 *   npm run proof:devnet
 *
 * This exercises lib/execute.ts exactly as the write tools do — same simulate,
 * same sign, same send, same confirmation wait — and prints a signature you can
 * open on an explorer. It deliberately does NOT touch the Bags SDK or your
 * configured wallet: it generates a throwaway keypair, funds it from the devnet
 * faucet, and sends SOL back to itself.
 *
 * The point is to prove the execution layer actually lands transactions, rather
 * than asserting it against a mock.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

process.env['BAGS_NETWORK'] = 'devnet';
// Ignore any inherited mainnet endpoint — this script is devnet-only.
delete process.env['HELIUS_RPC_URL'];
delete process.env['SOLANA_RPC_URL'];

const { getConnection, getRpcUrl, explorerUrl } = await import('../src/lib/network.js');
const { Executor } = await import('../src/lib/execute.js');

const TRANSFER_LAMPORTS = 1_000;
const PROOF_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.proof');

async function main() {
  const connection = getConnection();
  console.log(`network   devnet`);
  console.log(`rpc       ${getRpcUrl()}`);

  // Persisted, not regenerated. This script used to call Keypair.generate() on
  // every run, which made its own recovery advice impossible to follow: when the
  // faucet is rate limited it prints "fund this address and re-run", but the
  // re-run generated a DIFFERENT address and never saw the SOL. The key is kept
  // so a manually funded address survives to the next attempt.
  //
  // Still throwaway and still devnet-only — it holds valueless tokens and is
  // gitignored — but it has to be the SAME throwaway twice.
  const keyPath = process.env['PROOF_KEYPAIR_PATH'] || join(PROOF_DIR, 'devnet-payer.json');
  let payer: Keypair;
  if (existsSync(keyPath)) {
    payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))));
    console.log(`keypair   ${payer.publicKey.toBase58()} (reused from ${keyPath})`);
  } else {
    payer = Keypair.generate();
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, JSON.stringify(Array.from(payer.secretKey)), { mode: 0o600 });
    console.log(`keypair   ${payer.publicKey.toBase58()} (new throwaway, saved to ${keyPath})`);
  }

  console.log(`\nRequesting devnet airdrop…`);
  let balance = 0;
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL / 10);
    const latest = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed'
    );
    balance = await connection.getBalance(payer.publicKey);
    console.log(`airdrop   ok — ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (err) {
    console.error(`\nAirdrop failed: ${(err as Error).message}`);
    console.error(
      `The public devnet faucet is rate limited. Retry later, or fund this\n` +
      `DEVNET address manually and re-run — the keypair is saved, so the same\n` +
      `address is reused and will see the funds:\n\n` +
      `  ${payer.publicKey.toBase58()}\n\n` +
      `  https://faucet.solana.com  (select Devnet — NOT testnet)\n` +
      `  or: solana airdrop 0.1 ${payer.publicKey.toBase58()} --url devnet\n`
    );
    process.exit(2);
  }

  if (balance < TRANSFER_LAMPORTS) {
    console.error(`\nInsufficient balance after airdrop. Aborting.`);
    process.exit(2);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: TRANSFER_LAMPORTS,
    })
  );

  console.log(`\nExecuting through Executor.executeTransaction …`);
  const started = Date.now();
  const result = await Executor.executeTransaction(tx, payer);
  const elapsed = Date.now() - started;

  console.log(`\n--- PROOF -------------------------------------------------`);
  console.log(`signature ${result.signature}`);
  console.log(`explorer  ${result.explorer}`);
  console.log(`slot      ${result.slot}`);
  console.log(`wall      ${elapsed} ms (simulate + sign + send + confirm)`);
  console.log(`-----------------------------------------------------------`);

  // Independently re-fetch: do not trust our own return value.
  const fetched = await connection.getTransaction(result.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!fetched) {
    console.error(`\nVERIFY FAILED: the signature is not retrievable from the chain.`);
    process.exit(1);
  }
  console.log(`\nverified  re-fetched from chain in slot ${fetched.slot}, err=${JSON.stringify(fetched.meta?.err ?? null)}`);
  console.log(`          fee ${fetched.meta?.fee} lamports`);
  console.log(`\n${explorerUrl(result.signature)}`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err?.message ?? err}`);
  process.exit(1);
});
