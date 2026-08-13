import { BagsSDK } from '@bagsfm/bags-sdk';
import { getConnection } from './network.js';

let bagsClientInstance: BagsSDK | null = null;

export const BagsClient = {
  getBagsClient: function(): BagsSDK {
    if (!bagsClientInstance) {
      const apiKey = process.env['BAGS_API_KEY'];
      if (!apiKey) {
        throw new Error('BAGS_API_KEY is not set. Get one at https://dev.bags.fm.');
      }
      // Cluster and RPC come from lib/network — devnet unless BAGS_NETWORK
      // says otherwise. Never defaults to mainnet.
      bagsClientInstance = new BagsSDK(apiKey, getConnection());
    }

    return bagsClientInstance;
  },
  reset: function(): void {
    bagsClientInstance = null;
  }
};
