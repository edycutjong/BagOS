import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export const Wallet = {
  /**
   * Load a Solana keypair from a JSON byte-array file.
   *
   * Nothing derived from the file contents is ever placed in an error message:
   * a JSON parse failure on a secret key file can otherwise echo bytes of that
   * key back to the caller (and, in an MCP server, to the model).
   */
  loadKeypair(filePath: string): Keypair {
    let resolvedPath = filePath;
    if (filePath.startsWith('~/')) {
      const homedir = process.env['HOME'] || process.env['USERPROFILE'] || '';
      resolvedPath = path.join(homedir, filePath.slice(2));
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Keypair file not found at ${resolvedPath}. ` +
          `Set BAGS_KEYPAIR_PATH, or create one with: solana-keygen new -o ${resolvedPath}`
      );
    }

    const fileContent = fs.readFileSync(resolvedPath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      // Intentionally swallowing the parser's message — it can quote file bytes.
      throw new Error(
        `Keypair file at ${resolvedPath} is not valid JSON. ` +
          `Expected a JSON array of 64 bytes.`
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Keypair file at ${resolvedPath} must contain a JSON array of 64 bytes.`
      );
    }
    if (parsed.length !== 64) {
      throw new Error(
        `Keypair file at ${resolvedPath} contains ${parsed.length} bytes; expected 64.`
      );
    }

    try {
      return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
    } catch {
      throw new Error(
        `Keypair file at ${resolvedPath} is not a valid Ed25519 secret key.`
      );
    }
  }
};
