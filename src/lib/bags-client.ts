import { BagsClient } from '@bagsfm/bags-sdk';
import dotenv from 'dotenv';

dotenv.config();

let bagsClientInstance: BagsClient | null = null;

export function getBagsClient(): BagsClient {
  if (!bagsClientInstance) {
    const apiKey = process.env.BAGS_API_KEY;
    if (!apiKey) {
      throw new Error('BAGS_API_KEY environment variable is missing');
    }

    bagsClientInstance = new BagsClient({
      apiKey: apiKey,
    });
  }

  return bagsClientInstance;
}
