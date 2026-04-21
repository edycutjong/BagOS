import { BagsSDK } from "@bagsfm/bags-sdk";
import { jest } from "@jest/globals";

import { BagsClient } from "../../../src/lib/bags-client.js";

describe("BagsClient", () => {
  let originalApiKey: string | undefined;
  let originalRpcUrl: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.BAGS_API_KEY;
    originalRpcUrl = process.env.HELIUS_RPC_URL;
    BagsClient.reset();
  });

  afterEach(() => {
    process.env.BAGS_API_KEY = originalApiKey;
    process.env.HELIUS_RPC_URL = originalRpcUrl;
    BagsClient.reset();
  });

  it("throws error if BAGS_API_KEY is missing", () => {
    delete process.env.BAGS_API_KEY;
    expect(() => BagsClient.getBagsClient()).toThrow("BAGS_API_KEY environment variable is missing");
  });

  it("initializes client successfully with default RPC", () => {
    process.env.BAGS_API_KEY = "dummy_api_key";
    delete process.env.HELIUS_RPC_URL;
    const client = BagsClient.getBagsClient();
    expect(client).toBeInstanceOf(BagsSDK);
  });

  it("initializes client successfully with custom RPC and caches it", () => {
    process.env.BAGS_API_KEY = "dummy_api_key_2";
    process.env.HELIUS_RPC_URL = "https://custom.rpc/";
    const client1 = BagsClient.getBagsClient();
    const client2 = BagsClient.getBagsClient();
    expect(client1).toBeInstanceOf(BagsSDK);
    expect(client1).toBe(client2); // caching test
  });
});
