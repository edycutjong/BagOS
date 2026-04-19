import { createMockServer, createMockBagsClient } from "../helpers";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const mockBagsClient = createMockBagsClient();
jest.mock("../../lib/bags-client", () => ({
  getBagsClient: () => mockBagsClient,
}));

jest.mock("../../lib/wallet", () => ({
  loadKeypair: () => ({
    publicKey: { toBase58: () => SYSTEM_PROGRAM },
    secretKey: new Uint8Array(64),
  }),
}));

const mockCheckTokenGate = jest.fn().mockResolvedValue({ allowed: true, balance: 50000 });
jest.mock("../../lib/token-gate", () => ({
  checkTokenGate: (...args: any[]) => mockCheckTokenGate(...args),
}));

// Mock PublicKey so tools don't do real base58 validation
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  return {
    ...actual,
    PublicKey: jest.fn().mockImplementation((key: string) => ({
      toBase58: () => key,
      toString: () => key,
    })),
  };
});

import { ExecuteTradeTool } from "../../tools/ExecuteTrade";
import { ClaimFeesTool } from "../../tools/ClaimFees";
import { LaunchTokenTool } from "../../tools/LaunchToken";

describe("Write (token-gated) MCP Tools", () => {
  beforeEach(() => {
    mockCheckTokenGate.mockResolvedValue({ allowed: true, balance: 50000 });
    process.env.BOS_TOKEN_MINT = SOL_MINT;
    process.env.BOS_REQUIRED_BALANCE = "10000";
  });

  describe("ExecuteTrade", () => {
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

    it("executes trade when token gate passes", async () => {
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);

      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT,
        outputMint: SYSTEM_PROGRAM,
        amount: 1,
        side: "buy",
      });

      expect(result.content[0].text).toContain("Trade Execution Signed");
      expect(mockCheckTokenGate).toHaveBeenCalled();
    });

    it("blocks trade when token gate fails", async () => {
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 100 });
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);

      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT,
        outputMint: SYSTEM_PROGRAM,
        amount: 1,
        side: "buy",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access Denied");
    });

    it("blocks trade when gate fails with default balance", async () => {
      const original = process.env.BOS_REQUIRED_BALANCE;
      delete process.env.BOS_REQUIRED_BALANCE;
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);

      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 1, side: "buy"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("10000 $BOS");
      process.env.BOS_REQUIRED_BALANCE = original;
    });

    it("blocks trade when gate fails with custom BOS_REQUIRED_BALANCE", async () => {
      process.env.BOS_REQUIRED_BALANCE = "500";
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);

      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 1, side: "buy"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("500 $BOS");
      delete process.env.BOS_REQUIRED_BALANCE;
    });

    it("uses custom slippage when provided", async () => {
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);

      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT,
        outputMint: SYSTEM_PROGRAM,
        amount: 1,
        side: "buy",
        slippageBps: 500,
      });

      expect(result.content[0].text).toContain("5%");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.trade.createSwapTransaction.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      ExecuteTradeTool.registerTool(server);
      const result = await getHandler("bags_execute_trade")({
        inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 1, side: "buy"
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("ClaimFees", () => {
    it("claims fees when gate passes", async () => {
      const { server, getHandler } = createMockServer();
      ClaimFeesTool.registerTool(server);

      const result = await getHandler("bags_claim_fees")({
        tokenMints: [SOL_MINT],
      });

      expect(result.content[0].text).toContain("✅");
      expect(mockBagsClient.fee.getClaimTransactions).toHaveBeenCalled();
    });

    it("blocks claim when gate fails", async () => {
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      ClaimFeesTool.registerTool(server);

      const result = await getHandler("bags_claim_fees")({
        tokenMints: [SOL_MINT],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access Denied");
    });

    it("blocks claim when gate fails with default balance", async () => {
      const original = process.env.BOS_REQUIRED_BALANCE;
      delete process.env.BOS_REQUIRED_BALANCE;
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      ClaimFeesTool.registerTool(server);

      const result = await getHandler("bags_claim_fees")({
        tokenMints: [SOL_MINT],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("10000 $BOS");
      process.env.BOS_REQUIRED_BALANCE = original;
    });

    it("blocks claim when gate fails with custom BOS_REQUIRED_BALANCE", async () => {
      process.env.BOS_REQUIRED_BALANCE = "500";
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      ClaimFeesTool.registerTool(server);

      const result = await getHandler("bags_claim_fees")({
        tokenMints: [SOL_MINT],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("500 $BOS");
      delete process.env.BOS_REQUIRED_BALANCE;
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.fee.getClaimTransactions.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      ClaimFeesTool.registerTool(server);
      const result = await getHandler("bags_claim_fees")({ tokenMints: [SOL_MINT] });
      expect(result.isError).toBe(true);
    });
  });

  describe("LaunchToken", () => {
    it("launches token when gate passes", async () => {
      const { server, getHandler } = createMockServer();
      LaunchTokenTool.registerTool(server);

      const result = await getHandler("bags_launch_token")({
        name: "TestToken",
        symbol: "TT",
        description: "A test token",
      });

      expect(result.content[0].text).toContain("✅");
      expect(result.content[0].text).toContain("MockMint111");
    });

    it("blocks launch when gate fails", async () => {
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 500 });
      const { server, getHandler } = createMockServer();
      LaunchTokenTool.registerTool(server);

      const result = await getHandler("bags_launch_token")({
        name: "TestToken",
        symbol: "TT",
        description: "A test token",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access Denied");
    });

    it("blocks launch when gate fails with default balance", async () => {
      const original = process.env.BOS_REQUIRED_BALANCE;
      delete process.env.BOS_REQUIRED_BALANCE;
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      LaunchTokenTool.registerTool(server);

      const result = await getHandler("bags_launch_token")({
        name: "TestToken", symbol: "TT", description: "Test"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("10000 $BOS");
      process.env.BOS_REQUIRED_BALANCE = original;
    });

    it("blocks launch when gate fails with custom BOS_REQUIRED_BALANCE", async () => {
      process.env.BOS_REQUIRED_BALANCE = "500";
      mockCheckTokenGate.mockResolvedValue({ allowed: false, balance: 0 });
      const { server, getHandler } = createMockServer();
      LaunchTokenTool.registerTool(server);

      const result = await getHandler("bags_launch_token")({
        name: "TestToken", symbol: "TT", description: "Test"
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("500 $BOS");
      delete process.env.BOS_REQUIRED_BALANCE;
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.tokenLaunch.createTokenInfoAndMetadata.mockRejectedValueOnce(
        new Error("Network error")
      );
      const { server, getHandler } = createMockServer();
      LaunchTokenTool.registerTool(server);

      const result = await getHandler("bags_launch_token")({
        name: "TestToken",
        symbol: "TT",
        description: "A test token",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });
  });
});
