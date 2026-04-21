import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export const Wallet = {
  loadKeypair(filePath: string): Keypair {
  let resolvedPath = filePath;
  if (filePath.startsWith('~/')) {
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    resolvedPath = path.join(homedir, filePath.slice(2));
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Keypair file not found at ${resolvedPath}`);
  }

  const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
  let secretKey: Uint8Array;
  
  try {
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      secretKey = Uint8Array.from(parsed);
    } else {
      throw new Error('Invalid keypair format');
    }
  } catch (e: any) {
    throw new (Error as any)(`Failed to parse keypair from ${resolvedPath}: ${e.message}`, { cause: e });
  }

  return Keypair.fromSecretKey(secretKey);
  }
};
