/**
 * Mainnet proof: land ONE real swap through the production write path.
 *
 *   I_UNDERSTAND_THIS_SPENDS_REAL_SOL=yes BAGS_NETWORK=mainnet npm run proof:mainnet
 *
 * THIS SPENDS REAL MONEY. Nothing in CI runs it, and it refuses to run unless
 * both variables above are set explicitly — there is no default that reaches
 * mainnet, and no flag that lowers the bar.
 *
 * Why it exists: scripts/devnet-proof.ts proves the EXECUTION layer lands
 * transactions, but it bypasses the Bags SDK, the token gate, the caps and the
 * confirmation token — it transfers SOL to itself. This exercises the full
 * bags_execute_trade path in the order the tool uses it:
 *
 *   quote → token gate → caps → confirmation token → createSwapTransaction
 *         → simulate → sign → send → confirm → re-fetch from chain
 *
 * The re-fetch is the point. A function returning a signature proves the
 * function returned; only getTransaction proves the chain agrees. That
 * distinction is the entire reason this file exists — 1.x reported success for
 * transactions it had discarded, and every test passed.
 *
 * Deliberately NOT a test and NOT wired into `npm run ci`.
 */

import { PublicKey } from '@solana/web3.js';

// --- Gate 1: explicit, unambiguous opt-in. -----------------------------------
// Checked before anything is imported that could talk to a network.
if (process.env['I_UNDERSTAND_THIS_SPENDS_REAL_SOL'] !== 'yes') {
  console.error(
    'Refusing to run.\n\n' +
    'This script signs and submits a REAL mainnet swap with your keypair.\n' +
    'Set I_UNDERSTAND_THIS_SPENDS_REAL_SOL=yes to confirm you intend that.\n'
  );
  process.exit(2);
}
if (process.env['BAGS_NETWORK'] !== 'mainnet') {
  console.error(
    'Refusing to run.\n\n' +
    `BAGS_NETWORK is "${process.env['BAGS_NETWORK'] ?? 'unset'}" — this script is mainnet-only.\n` +
    'Bags has no devnet deployment, so there is nothing to prove on devnet:\n' +
    'use scripts/devnet-proof.ts for the execution layer instead.\n'
  );
  process.exit(2);
}

const { getConnection, explorerUrl } = await import('../src/lib/network.js');
const { BagsClient } = await import('../src/lib/bags-client.js');
const { Wallet } = await import('../src/lib/wallet.js');
const { TokenGate } = await import('../src/lib/token-gate.js');
const { assertWithinCaps, issueToken, consumeToken, recordSpend, confirmationRequired } =
  await import('../src/lib/guards.js');
const { Executor } = await import('../src/lib/execute.js');

const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Hard ceiling for this script, independent of BAGS_MAX_SOL_PER_TX.
 *
 * The env caps are the product's control and an operator may legitimately raise
 * them. This is a property of the SCRIPT: a proof artifact needs to be small
 * enough that running it is never a financial decision. Raising the env cap must
 * not raise this, so it is checked separately and first.
 */
const SCRIPT_MAX_SOL = 0.01;

function amountSol(): number {
  const raw = process.env['PROOF_SOL_AMOUNT'];
  const value = raw === undefined || raw === '' ? SCRIPT_MAX_SOL : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`PROOF_SOL_AMOUNT must be a positive number (got "${raw}").`);
    process.exit(2);
  }
  if (value > SCRIPT_MAX_SOL) {
    console.error(
      `Refusing to run: ${value} SOL exceeds this script's hard ceiling of ${SCRIPT_MAX_SOL} SOL.\n` +
      'This ceiling is not configurable. Edit the constant deliberately if you mean it.'
    );
    process.exit(2);
  }
  return value;
}

async function main() {
  const outputMint = process.env['PROOF_OUTPUT_MINT'];
  if (!outputMint) {
    console.error('PROOF_OUTPUT_MINT is required — the token to swap into.');
    process.exit(2);
  }

  const sol = amountSol();
  const lamports = Math.round(sol * 1_000_000_000);
  const keypair = Wallet.loadKeypair(
    process.env['BAGS_KEYPAIR_PATH'] || '~/.config/bags/keypair.json'
  );
  const walletAddress = keypair.publicKey.toBase58();
  const connection = getConnection();
  const client = BagsClient.getBagsClient();

  console.log('network   🔴 MAINNET — real funds');
  console.log(`wallet    ${walletAddress}`);
  console.log(`swap      ${sol} SOL → ${outputMint}`);
  console.log(`ceiling   ${SCRIPT_MAX_SOL} SOL (script-level, not configurable)\n`);

  // --- the production order, step by step -----------------------------------
  console.log('1/8 quote …');
  const quoteResponse = await client.trade.getQuote({
    inputMint: new PublicKey(SOL_MINT),
    outputMint: new PublicKey(outputMint),
    amount: lamports,
  });

  console.log('2/8 token gate …');
  const gate = await TokenGate.checkTokenGate(walletAddress);
  if (!gate.allowed) {
    console.error(`Gate denied: balance ${gate.balance} is below the required minimum.`);
    process.exit(3);
  }
  console.log(`    passed — balance ${gate.balance}`);

  console.log('3/8 spend caps …');
  assertWithinCaps(sol);

  console.log('4/8 confirmation token …');
  const action = { inputMint: SOL_MINT, outputMint, amount: lamports };
  if (confirmationRequired()) {
    const token = issueToken('bags_execute_trade', action, sol);
    // Consumed immediately and in-process. That is honest about what this
    // proves: the token is fingerprinted to these exact arguments and is
    // single-use. It does NOT prove a human paused — a human already did, by
    // setting I_UNDERSTAND_THIS_SPENDS_REAL_SOL.
    consumeToken(token, 'bags_execute_trade', action);
    console.log('    issued and consumed (argument-fingerprinted, single-use)');
  } else {
    console.log('    SKIPPED — BAGS_ALLOW_UNCONFIRMED is set');
  }

  console.log('5/8 createSwapTransaction …');
  const { transaction } = await client.trade.createSwapTransaction({
    userPublicKey: new PublicKey(walletAddress),
    quoteResponse,
  });

  console.log('6/8 simulate → sign → send → confirm …');
  const started = Date.now();
  const result = await Executor.executeTransaction(transaction, keypair);
  const elapsed = Date.now() - started;
  recordSpend(sol);

  console.log('\n--- PROOF -------------------------------------------------');
  console.log(`signature ${result.signature}`);
  console.log(`explorer  ${result.explorer}`);
  console.log(`slot      ${result.slot}`);
  console.log(`wall      ${elapsed} ms`);
  console.log('-----------------------------------------------------------');

  console.log('\n7/8 re-fetching from chain …');
  const fetched = await connection.getTransaction(result.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!fetched) {
    console.error('VERIFY FAILED: the signature is not retrievable from the chain.');
    process.exit(1);
  }
  console.log(
    `    confirmed in slot ${fetched.slot}, err=${JSON.stringify(fetched.meta?.err ?? null)}, ` +
    `fee ${fetched.meta?.fee} lamports`
  );

  console.log('\n8/8 done.');
  console.log(explorerUrl(result.signature));
}

main().catch((err) => {
  console.error(`\nFAILED: ${err?.message ?? err}`);
  process.exit(1);
});
