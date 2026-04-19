/**
 * Tests for src/lib/token-gate.ts
 *
 * We mock @solana/web3.js at module level. Because token-gate.ts uses
 * `jest.resetModules()` and dynamic `require()`, each test gets a fresh
 * copy of the module with its own Connection mock binding.
 */

const VALID_WALLET = "11111111111111111111111111111111";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const ORIGINAL_ENV = process.env;

// Shared mock for getParsedTokenAccountsByOwner
const mockGetParsed = jest.fn();

jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getParsedTokenAccountsByOwner: mockGetParsed,
    })),
    PublicKey: jest.fn().mockImplementation((key: string) => ({
      toBase58: () => key,
      toString: () => key,
    })),
  };
});

beforeEach(() => {
  jest.resetModules();
  mockGetParsed.mockReset();
  process.env = { ...ORIGINAL_ENV };
  process.env.BOS_TOKEN_MINT = SOL_MINT;
  process.env.BOS_REQUIRED_BALANCE = "10000";
  process.env.HELIUS_RPC_URL = "https://api.mainnet-beta.solana.com";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("token-gate.ts — checkTokenGate", () => {
  it("returns allowed when balance >= required", async () => {
    mockGetParsed.mockResolvedValue({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: { tokenAmount: { uiAmount: 15000 } },
              },
            },
          },
        },
      ],
    });

    const { checkTokenGate } = require("../../lib/token-gate");
    const result = await checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(true);
    expect(result.balance).toBe(15000);
  });

  it("returns denied when balance < required", async () => {
    mockGetParsed.mockResolvedValue({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: { tokenAmount: { uiAmount: 500 } },
              },
            },
          },
        },
      ],
    });

    const { checkTokenGate } = require("../../lib/token-gate");
    const result = await checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(500);
  });

  it("returns 0 balance when no token accounts exist", async () => {
    mockGetParsed.mockResolvedValue({ value: [] });

    const { checkTokenGate } = require("../../lib/token-gate");
    const result = await checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(0);
  });

  it("throws when BOS_TOKEN_MINT is undefined", async () => {
    delete process.env.BOS_TOKEN_MINT;
    const { checkTokenGate } = require("../../lib/token-gate");
    await expect(checkTokenGate(VALID_WALLET)).rejects.toThrow(
      "BOS_TOKEN_MINT is not defined"
    );
  });

  it("uses default required balance and RPC URL when env vars are missing", async () => {
    delete process.env.BOS_REQUIRED_BALANCE;
    delete process.env.HELIUS_RPC_URL;
    mockGetParsed.mockResolvedValue({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: { tokenAmount: { uiAmount: 20000 } },
              },
            },
          },
        },
      ],
    });
    const { checkTokenGate } = require("../../lib/token-gate");
    const result = await checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(true);
  });

  it("handles token amount fallback when amount is falsy", async () => {
    mockGetParsed.mockResolvedValue({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: { tokenAmount: { uiAmount: null } },
              },
            },
          },
        },
      ],
    });
    const { checkTokenGate } = require("../../lib/token-gate");
    const result = await checkTokenGate(VALID_WALLET);
    expect(result.balance).toBe(0);
  });
});
