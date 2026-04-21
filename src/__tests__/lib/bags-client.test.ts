import { BagsClient } from "../../../src/lib/bags-client.js";
import { BagsSDK } from "@bagsfm/bags-sdk";

describe("BagsClient", () => {
  let originalApiKey: string | undefined;
  let originalRpcUrl: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.BAGS_API_KEY;
    originalRpcUrl = process.env.HELIUS_RPC_URL;
    // We need to reset the module instances internally if possible.
    // However, since bagsClientInstance is a module-scoped variable and not exported,
    // we can't reset it directly without module reloading. Using jest.isolateModules works nicely.
  });

  afterEach(() => {
    process.env.BAGS_API_KEY = originalApiKey;
    process.env.HELIUS_RPC_URL = originalRpcUrl;
  });

  it("throws error if BAGS_API_KEY is missing", async () => {
    delete process.env.BAGS_API_KEY;
    await jest.isolateModulesAsync(async () => {
      const { BagsClient: IsolatedBagsClient } = await import("../../../src/lib/bags-client.js");
      expect(() => IsolatedBagsClient.getBagsClient()).toThrow("BAGS_API_KEY environment variable is missing");
    });
  });

  it("initializes client successfully with default RPC", async () => {
    process.env.BAGS_API_KEY = "dummy_api_key";
    delete process.env.HELIUS_RPC_URL;
    await jest.isolateModulesAsync(async () => {
      const { BagsClient: IsolatedBagsClient } = await import("../../../src/lib/bags-client.js");
      const client = IsolatedBagsClient.getBagsClient();
      expect(client).toBeInstanceOf(BagsSDK);
    });
  });

  it("initializes client successfully with custom RPC and caches it", async () => {
    process.env.BAGS_API_KEY = "dummy_api_key_2";
    process.env.HELIUS_RPC_URL = "https://custom.rpc/";
    await jest.isolateModulesAsync(async () => {
      const { BagsClient: IsolatedBagsClient } = await import("../../../src/lib/bags-client.js");
      const client1 = IsolatedBagsClient.getBagsClient();
      const client2 = IsolatedBagsClient.getBagsClient();
      expect(client1).toBeInstanceOf(BagsSDK);
      expect(client1).toBe(client2); // caching test
    });
  });
});
