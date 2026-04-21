import { BagsSDK } from '@bagsfm/bags-sdk';
import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

let bagsClientInstance: BagsSDK | null = null;

export const BagsClient = {
  getBagsClient: function(): BagsSDK {
    if (!bagsClientInstance) {
      const apiKey = process.env.BAGS_API_KEY;
      if (!apiKey) {
        throw new Error('BAGS_API_KEY environment variable is missing');
      }

      const rpcUrl = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');

      bagsClientInstance = new BagsSDK(apiKey, connection);
    }

    return bagsClientInstance;
  }
};
