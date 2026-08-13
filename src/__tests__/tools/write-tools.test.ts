import { createMockServer, createMockBagsClient, setWriteToolEnv, tokenFrom } from "../helpers.js";
import { jest } from "@jest/globals";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const mockBagsClient = createMockBagsClient();
import { BagsClient } from "../../lib/bags-client.js";
jest.spyOn(BagsClient, "getBagsClient").mockReturnValue(mockBagsClient as any);

import { Wallet } from "../../lib/wallet.js";
jest.spyOn(Wallet, "loadKeypair").mockReturnValue({
  publicKey: { toBase58: () => SYSTEM_PROGRAM },
  secretKey: new Uint8Array(64),
} as any);

import { TokenGate } from "../../lib/token-gate.js";
const mockCheckTokenGate = jest.spyOn(TokenGate, "checkTokenGate");

import { Executor } from "../../lib/execute.js";
const mockExecute = jest.spyOn(Executor, "executeTransaction");
const mockExecuteAll = jest.spyOn(Executor, "executeAll");

import { resetGuards } from "../../lib/guards.js";

import { ExecuteTradeTool } from "../../tools/ExecuteTrade";
import { ClaimFeesTool } from "../../tools/ClaimFees";
import { LaunchTokenTool } from "../../tools/LaunchToken";

const okResult = {
  signature: "5xSig",
  explorer: "https://explorer.solana.com/tx/5xSig?cluster=devnet",
  slot: 123,
};

/** Drive a write tool through preview -> confirm and return both responses. */
async function previewThenConfirm(handler: any, args: any) {
  const preview = await handler(args);
  const token = tokenFrom(preview);
  const confirmed = await handler({ ...args, confirm: token });
  return { preview, token, confirmed };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetGuards();
  setWriteToolEnv();
  mockCheckTokenGate.mockResolvedValue({ allowed: true, balance: 50000 });
  mockExecute.mockResolvedValue(okResult);
  mockExecuteAll.mockResolvedValue({ executed: [okResult], failedAt: null, error: null });
});

describe("ExecuteTrade", () => {
  const call = () => {
    const { server, getHandler } = createMockServer();
    ExecuteTradeTool.registerTool(server);
    return getHandler("bags_execute_trade");
  };

  it("registers the tool", () => {
    const { server } = createMockServer();
    ExecuteTradeTool.registerTool(server);
    expect(server.tool).toHaveBeenCalledWith(
      "bags_execute_trade",
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("first call previews and does NOT execute", async () => {
    const result = await call()({ inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 0.05 });

    expect(result.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(result.content[0].text).toContain("nothing has been signed or sent");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("executes and reports a real signature once confirmed", async () => {
    const { confirmed } = await previewThenConfirm(call(), {
      inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 0.05,
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(confirmed.content[0].text).toContain("confirmed on chain");
    expect(confirmed.content[0].text).toContain(okResult.signature);
    expect(confirmed.content[0].text).toContain(okResult.explorer);
  });

  it("never claims success when execution throws", async () => {
    mockExecute.mockRejectedValue(new Error("blockhash not found"));
    const handler = call();
    const preview = await handler({ amount: 0.05 });
    const result = await handler({ amount: 0.05, confirm: tokenFrom(preview) });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("confirmed on chain");
  });

  /* --- bypass resistance: these are the tests that must never regress --- */

  it("rejects a replayed confirmation token", async () => {
    const handler = call();
    const args = { inputMint: SOL_MINT, amount: 0.05 };
    const token = tokenFrom(await handler(args));

    await handler({ ...args, confirm: token });
    const replay = await handler({ ...args, confirm: token });

    expect(replay.isError).toBe(true);
    expect(replay.content[0].text).toContain("Unknown or already-used");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("rejects a token issued for different arguments", async () => {
    const handler = call();
    const token = tokenFrom(await handler({ inputMint: SOL_MINT, amount: 0.01 }));

    // Same token, larger trade.
    const result = await handler({ inputMint: SOL_MINT, amount: 0.09, confirm: token });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("does not match these arguments");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects a fabricated token", async () => {
    const result = await call()({ inputMint: SOL_MINT, amount: 0.05, confirm: "not-a-real-token" });

    expect(result.isError).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("enforces the per-transaction cap before touching the SDK", async () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '0.1';
    const result = await call()({ inputMint: SOL_MINT, amount: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Per-transaction cap exceeded");
    expect(mockBagsClient.trade.getQuote).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("enforces the session cap across successive trades", async () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '1';
    process.env['BAGS_MAX_SOL_PER_SESSION'] = '1';
    const handler = call();

    await previewThenConfirm(handler, { inputMint: SOL_MINT, amount: 0.6 });
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // 0.6 + 0.6 exceeds the 1.0 session cap.
    const second = await handler({ inputMint: SOL_MINT, amount: 0.6 });
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain("Session cap exceeded");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does not count a failed trade against the session cap", async () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '1';
    process.env['BAGS_MAX_SOL_PER_SESSION'] = '1';
    mockExecute.mockRejectedValue(new Error("send failed"));
    const handler = call();

    const preview = await handler({ inputMint: SOL_MINT, amount: 0.9 });
    await handler({ inputMint: SOL_MINT, amount: 0.9, confirm: tokenFrom(preview) });

    mockExecute.mockResolvedValue(okResult);
    const retry = await handler({ inputMint: SOL_MINT, amount: 0.9 });
    expect(retry.content[0].text).toContain("CONFIRMATION REQUIRED");
  });

  it("refuses to write on devnet, explaining that Bags is mainnet-only", async () => {
    process.env['BAGS_NETWORK'] = 'devnet';
    const result = await call()({ inputMint: SOL_MINT, amount: 0.05 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("require mainnet");
    expect(result.content[0].text).toContain("no devnet deployment");
    expect(mockBagsClient.trade.getQuote).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("blocks entirely when the token gate fails", async () => {
    mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 12 });
    const result = await call()({ inputMint: SOL_MINT, amount: 0.05 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Access denied");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("skips the preview only when BAGS_ALLOW_UNCONFIRMED is true", async () => {
    process.env['BAGS_ALLOW_UNCONFIRMED'] = 'true';
    const result = await call()({ inputMint: SOL_MINT, amount: 0.05 });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("confirmed on chain");
  });

  it("still enforces caps when confirmation is disabled", async () => {
    process.env['BAGS_ALLOW_UNCONFIRMED'] = 'true';
    process.env['BAGS_MAX_SOL_PER_TX'] = '0.1';
    const result = await call()({ inputMint: SOL_MINT, amount: 5 });

    expect(result.isError).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("ClaimFees", () => {
  const call = () => {
    const { server, getHandler } = createMockServer();
    ClaimFeesTool.registerTool(server);
    return getHandler("bags_claim_fees");
  };

  it("registers the tool", () => {
    const { server } = createMockServer();
    ClaimFeesTool.registerTool(server);
    expect(server.tool).toHaveBeenCalledWith(
      "bags_claim_fees", expect.any(String), expect.any(Object), expect.any(Function)
    );
  });

  it("previews before claiming", async () => {
    const result = await call()({ tokenMints: [SOL_MINT] });
    expect(result.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(mockExecuteAll).not.toHaveBeenCalled();
  });

  it("returns confirmed signatures after confirmation", async () => {
    const { confirmed } = await previewThenConfirm(call(), { tokenMints: [SOL_MINT] });
    expect(mockExecuteAll).toHaveBeenCalledTimes(1);
    expect(confirmed.content[0].text).toContain(okResult.signature);
  });

  it("reports partial failure honestly instead of claiming success", async () => {
    mockExecuteAll.mockResolvedValue({
      executed: [okResult],
      failedAt: 1,
      error: new Error("insufficient funds"),
    });
    const handler = call();
    const preview = await handler({ tokenMints: [SOL_MINT] });
    const result = await handler({ tokenMints: [SOL_MINT], confirm: tokenFrom(preview) });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Partial claim");
    expect(result.content[0].text).toContain("insufficient funds");
  });

  it("does nothing when there is nothing claimable", async () => {
    mockBagsClient.fee.getClaimTransactions.mockResolvedValue([]);
    const result = await call()({ tokenMints: [SOL_MINT] });

    expect(result.content[0].text).toContain("No claimable fees");
    expect(mockExecuteAll).not.toHaveBeenCalled();
    mockBagsClient.fee.getClaimTransactions.mockResolvedValue([{ instructions: [], sign: jest.fn(), serialize: () => new Uint8Array() }]);
  });

  it("blocks when the token gate fails", async () => {
    mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
    const result = await call()({ tokenMints: [SOL_MINT] });

    expect(result.isError).toBe(true);
    expect(mockExecuteAll).not.toHaveBeenCalled();
  });
});

describe("PrepareTokenMetadata (formerly LaunchToken)", () => {
  const call = () => {
    const { server, getHandler } = createMockServer();
    LaunchTokenTool.registerTool(server);
    return getHandler("bags_prepare_token_metadata");
  };

  it("registers under the honest name", () => {
    const { server } = createMockServer();
    LaunchTokenTool.registerTool(server);
    expect(server.tool).toHaveBeenCalledWith(
      "bags_prepare_token_metadata", expect.any(String), expect.any(Object), expect.any(Function)
    );
  });

  it("states plainly that nothing was launched", async () => {
    const result = await call()({ name: "Test", symbol: "TST", description: "d" });

    expect(result.content[0].text).toContain("NOT LAUNCHED");
    expect(result.content[0].text).toContain("MockMint111");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("blocks when the token gate fails", async () => {
    mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 5 });
    const result = await call()({ name: "Test", symbol: "TST", description: "d" });

    expect(result.isError).toBe(true);
  });
});
