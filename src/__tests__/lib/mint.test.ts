import { jest } from "@jest/globals";

/**
 * Decimals must come from the mint, never be assumed. The previous code used a
 * hardcoded 1e9, so a 6-decimal input (USDC and most pump-style mints) traded
 * 1000x the requested size.
 */

const mockConnection = { getParsedAccountInfo: jest.fn<any>() };

jest.unstable_mockModule("../../lib/network.js", () => ({
  getConnection: () => mockConnection,
  explorerUrl: (s: string) => `https://explorer.solana.com/tx/${s}`,
  getNetwork: () => "devnet",
  isMainnet: () => false,
  getRpcUrl: () => "http://localhost:8899",
  redactedRpcUrl: () => "http://localhost:8899",
  resetConnection: () => {},
  networkBanner: () => "devnet",
  clusterFromUrl: () => null,
  assertBagsWritesSupported: () => {},
  UnsupportedNetworkError: class extends Error {},
}));

const { Mint, SOL_MINT } = await import("../../lib/mint.js");
const { getMintDecimals, toBaseUnits, resetMintCache } = Mint;

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function parsed(decimals: unknown) {
  return { value: { data: { parsed: { info: { decimals } } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMintCache();
});

describe("getMintDecimals", () => {
  it("knows SOL without a network call", async () => {
    await expect(getMintDecimals(SOL_MINT)).resolves.toBe(9);
    expect(mockConnection.getParsedAccountInfo).not.toHaveBeenCalled();
  });

  it("reads decimals from the mint account", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(6));
    await expect(getMintDecimals(USDC)).resolves.toBe(6);
  });

  it("caches per mint", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(6));
    await getMintDecimals(USDC);
    await getMintDecimals(USDC);
    expect(mockConnection.getParsedAccountInfo).toHaveBeenCalledTimes(1);
  });

  it("refuses to guess when the account is missing", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue({ value: null });
    await expect(getMintDecimals(USDC)).rejects.toThrow("Could not read decimals");
  });

  it("refuses to guess when the data is not parsed", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue({ value: { data: Buffer.from("raw") } });
    await expect(getMintDecimals(USDC)).rejects.toThrow("Could not read decimals");
  });

  it("rejects implausible decimals", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(99));
    await expect(getMintDecimals(USDC)).rejects.toThrow("implausible decimals");
  });
});

describe("toBaseUnits", () => {
  it("scales SOL by 1e9", async () => {
    await expect(toBaseUnits(0.05, SOL_MINT)).resolves.toBe(50_000_000);
  });

  it("scales a 6-decimal mint by 1e6, not 1e9", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(6));
    // The regression: 1e9 would have produced 100_000_000_000 for "100".
    await expect(toBaseUnits(100, USDC)).resolves.toBe(100_000_000);
  });

  it("handles a 0-decimal mint", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(0));
    await expect(toBaseUnits(7, USDC)).resolves.toBe(7);
  });

  it("rounds rather than truncating", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(2));
    await expect(toBaseUnits(1.006, USDC)).resolves.toBe(101);
  });

  it("is subject to IEEE-754 representation at the half-cent boundary", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(2));
    // 1.005 * 100 === 100.49999999999999 in double precision, so this rounds
    // DOWN. Documented rather than papered over: base-unit conversion through
    // a float is exact only for values representable in binary. The error is
    // at most one base unit, which is negligible against the spend caps, but
    // it is real.
    await expect(toBaseUnits(1.005, USDC)).resolves.toBe(100);
  });

  it("refuses an amount outside the safe integer range", async () => {
    mockConnection.getParsedAccountInfo.mockResolvedValue(parsed(18));
    await expect(toBaseUnits(1e9, USDC)).rejects.toThrow("safe integer range");
  });

  it("refuses a non-finite amount", async () => {
    await expect(toBaseUnits(Infinity, SOL_MINT)).rejects.toThrow();
  });
});
