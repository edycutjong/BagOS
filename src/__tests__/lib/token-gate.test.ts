/**
 * Tests for src/lib/token-gate.ts
 *
 * We mock @solana/web3.js at module level.
 */
import { jest } from "@jest/globals";
import { TokenGate } from "../../lib/token-gate.js";

const VALID_WALLET = "11111111111111111111111111111111";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const ORIGINAL_ENV = process.env;

import { Connection } from "@solana/web3.js";
const mockGetParsed = jest.spyOn(Connection.prototype, "getParsedTokenAccountsByOwner") as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetParsed.mockReset();
  process.env = { ...ORIGINAL_ENV };
  process.env.BOS_TOKEN_MINT = SOL_MINT;
  process.env.BOS_REQUIRED_BALANCE = "10000";
  process.env.HELIUS_RPC_URL = "https://api.devnet.solana.com";
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

    const result = await TokenGate.checkTokenGate(VALID_WALLET);
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

    const result = await TokenGate.checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(500);
  });

  it("returns 0 balance when no token accounts exist", async () => {
    mockGetParsed.mockResolvedValue({ value: [] });

    const result = await TokenGate.checkTokenGate(VALID_WALLET);
    expect(result.allowed).toBe(false);
    expect(result.balance).toBe(0);
  });

  it("throws when BOS_TOKEN_MINT is undefined", async () => {
    delete process.env.BOS_TOKEN_MINT;
    await expect(TokenGate.checkTokenGate(VALID_WALLET)).rejects.toThrow(
      "BOS_TOKEN_MINT is not set"
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
    const result = await TokenGate.checkTokenGate(VALID_WALLET);
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
    const result = await TokenGate.checkTokenGate(VALID_WALLET);
    expect(result.balance).toBe(0);
  });
});

/**
 * BOS_REQUIRED_BALANCE parsing.
 *
 * These are regression tests for a fail-open bug: the threshold was read as
 * `Number(env) || DEFAULT`, so 0 (falsy) and NaN (falsy) both collapsed into
 * 10000. Asking for no gate produced a gate, and a typo produced a gate the
 * operator never chose. Each of the three cases below fails against that code.
 */
describe("token-gate.ts — BOS_REQUIRED_BALANCE", () => {
  const zeroBalanceAccounts = { value: [] };

  it("respects an explicit 0 — the gate is disabled, a zero balance passes", async () => {
    process.env.BOS_REQUIRED_BALANCE = "0";
    mockGetParsed.mockResolvedValue(zeroBalanceAccounts as never);
    const result = await TokenGate.checkTokenGate(VALID_WALLET);
    // Against `Number(env) || DEFAULT` this is false: 0 became 10000.
    expect(result).toEqual({ allowed: true, balance: 0 });
  });

  it("throws on a non-numeric value instead of silently defaulting", async () => {
    process.env.BOS_REQUIRED_BALANCE = "abc";
    mockGetParsed.mockResolvedValue(zeroBalanceAccounts as never);
    await expect(TokenGate.checkTokenGate(VALID_WALLET)).rejects.toThrow(
      /BOS_REQUIRED_BALANCE must be a non-negative number \(got "abc"\)/
    );
  });

  it("throws on a negative value", async () => {
    process.env.BOS_REQUIRED_BALANCE = "-1";
    mockGetParsed.mockResolvedValue(zeroBalanceAccounts as never);
    await expect(TokenGate.checkTokenGate(VALID_WALLET)).rejects.toThrow(
      /BOS_REQUIRED_BALANCE must be a non-negative number/
    );
  });

  it("falls back to 10000 when unset", async () => {
    delete process.env.BOS_REQUIRED_BALANCE;
    mockGetParsed.mockResolvedValue({
      value: [
        { account: { data: { parsed: { info: { tokenAmount: { uiAmount: 9999 } } } } } },
      ],
    } as never);
    const below = await TokenGate.checkTokenGate(VALID_WALLET);
    expect(below).toEqual({ allowed: false, balance: 9999 });
  });

  it("treats an empty string as unset rather than as 0", async () => {
    process.env.BOS_REQUIRED_BALANCE = "";
    mockGetParsed.mockResolvedValue(zeroBalanceAccounts as never);
    const result = await TokenGate.checkTokenGate(VALID_WALLET);
    expect(result).toEqual({ allowed: false, balance: 0 });
  });
});
