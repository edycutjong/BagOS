import { createMockServer, createMockBagsClient } from "../helpers.js";
import { jest } from "@jest/globals";

// Use real Solana addresses (SOL native mint, System Program)
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
jest.spyOn(TokenGate, "checkTokenGate").mockResolvedValue({ allowed: true, balance: 50000 });



import { GetClaimableFeesTool } from "../../tools/GetClaimableFees";
import { GetTradeQuoteTool } from "../../tools/GetTradeQuote";
import { GetCreatorsTool } from "../../tools/GetCreators";
import { GetTokenAnalyticsTool } from "../../tools/GetTokenAnalytics";
import { GetPartnerStatsTool } from "../../tools/GetPartnerStats";
import { HeartbeatTool } from "../../tools/Heartbeat";

// A base58 string long enough to be key-shaped (>= 80 chars). Same leak-channel
// bar as state-read-tools.test.ts and authenticate.test.ts: if an SDK error
// message ever carries key material, the tool response must not.
const KEY_SHAPED_BASE58 = "5".repeat(88);

describe("Read-only MCP Tools", () => {
  beforeEach(() => {
    delete process.env.BAGS_KEYPAIR_PATH;
    delete process.env.USE_MOCK_DATA;
    delete process.env.BOS_TOKEN_MINT;
  });

  describe("GetClaimableFees", () => {
    it("registers and returns fee data", async () => {
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      expect(server.tool).toHaveBeenCalledWith(
        "bags_get_claimable_fees",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );

      const result = await getHandler("bags_get_claimable_fees")({
        walletAddress: SYSTEM_PROGRAM,
      });
      expect(result.content[0].text).toContain("Claimable Fees");
      expect(result.isError).toBeUndefined();
    });

    it("uses local keypair when no wallet provided", async () => {
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      const result = await getHandler("bags_get_claimable_fees")({});
      expect(result.content[0].text).toContain(SYSTEM_PROGRAM);
    });

    it("returns mock data when USE_MOCK_DATA is true", async () => {
      process.env.USE_MOCK_DATA = 'true';
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      const result = await getHandler("bags_get_claimable_fees")({});
      expect(result.content[0].text).toContain("MOCK DATA ENABLED");
      expect(result.isError).toBeUndefined();
      delete process.env.USE_MOCK_DATA;
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.fee.getAllClaimablePositions.mockRejectedValueOnce(new Error("RPC down"));
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      const result = await getHandler("bags_get_claimable_fees")({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("RPC down");
    });

    it("uses custom BAGS_KEYPAIR_PATH when provided", async () => {
      process.env.BAGS_KEYPAIR_PATH = "custom/path.json";
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      const result = await getHandler("bags_get_claimable_fees")({});
      expect(result.isError).toBeUndefined();
      delete process.env.BAGS_KEYPAIR_PATH;
    });
  });

  describe("GetTradeQuote", () => {
    it("registers and returns quote data", async () => {
      const { server, getHandler } = createMockServer();
      GetTradeQuoteTool.registerTool(server);

      const result = await getHandler("bags_get_trade_quote")({
        inputMint: SOL_MINT,
        outputMint: SYSTEM_PROGRAM,
        amount: 1,
        side: "buy",
      });
      expect(result.content[0].text).toContain("Trade Quote");
      expect(result.isError).toBeUndefined();
    });

    it("uses default mints when inputMint and outputMint are omitted", async () => {
      const { server, getHandler } = createMockServer();
      GetTradeQuoteTool.registerTool(server);

      const result = await getHandler("bags_get_trade_quote")({
        amount: 1,
        side: "buy",
      });
      expect(result.content[0].text).toContain("Trade Quote");
      expect(result.isError).toBeUndefined();
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.trade.getQuote.mockRejectedValueOnce(new Error("Invalid mint"));
      const { server, getHandler } = createMockServer();
      GetTradeQuoteTool.registerTool(server);
      const result = await getHandler("bags_get_trade_quote")({
        inputMint: SOL_MINT,
        outputMint: SYSTEM_PROGRAM,
        amount: 1,
        side: "buy",
      });
      expect(result.isError).toBe(true);
      // the SDK's own message still reaches the model — only the hand-rolled
      // "Failed to fetch quote:" prefix went away with the toolError migration
      expect(result.content[0].text).toContain("Invalid mint");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });
  });

  describe("GetCreators", () => {
    it("registers and returns creator leaderboard", async () => {
      const { server, getHandler } = createMockServer();
      GetCreatorsTool.registerTool(server);

      const result = await getHandler("bags_get_creators")({});
      expect(result.content[0].text).toContain("Top");
      expect(result.content[0].text).toContain("Alice");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getTopTokensByLifetimeFees.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetCreatorsTool.registerTool(server);
      const result = await getHandler("bags_get_creators")({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });
  });

  describe("GetTokenAnalytics", () => {
    it("registers and returns analytics", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenAnalyticsTool.registerTool(server);

      const result = await getHandler("bags_get_token_analytics")({
        tokenMint: SOL_MINT,
      });
      expect(result.content[0].text).toContain("Analytics");
      expect(result.content[0].text).toContain("42");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getTokenLifetimeFees.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetTokenAnalyticsTool.registerTool(server);
      const result = await getHandler("bags_get_token_analytics")({ tokenMint: SOL_MINT });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });
  });

  describe("GetPartnerStats", () => {
    it("registers and returns partner stats", async () => {
      const { server, getHandler } = createMockServer();
      GetPartnerStatsTool.registerTool(server);

      const result = await getHandler("bags_get_partner_stats")({
        partnerId: SOL_MINT,
      });
      expect(result.content[0].text).toContain("Partner Referral Stats");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.partner.getPartnerConfigClaimStats.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetPartnerStatsTool.registerTool(server);
      const result = await getHandler("bags_get_partner_stats")({ partnerId: SOL_MINT });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });
  });

  describe("Heartbeat", () => {
    it("registers and returns health status", async () => {
      const { server, getHandler } = createMockServer();
      HeartbeatTool.registerTool(server);

      const result = await getHandler("bags_heartbeat")({});
      expect(result.content[0].text).toContain("Heartbeat");
      expect(result.content[0].text).toContain("Operational");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.fee.getAllClaimablePositions.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      HeartbeatTool.registerTool(server);
      const result = await getHandler("bags_heartbeat")({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });

    it("uses custom BAGS_KEYPAIR_PATH when provided", async () => {
      process.env.BAGS_KEYPAIR_PATH = "custom/path.json";
      const { server, getHandler } = createMockServer();
      HeartbeatTool.registerTool(server);
      const result = await getHandler("bags_heartbeat")({});
      expect(result.isError).toBeUndefined();
      delete process.env.BAGS_KEYPAIR_PATH;
    });
  });

  // These six tools used to return `Failed to ...: ${error.message}` directly, so an
  // SDK error carrying key material was republished verbatim into the model's context.
  // They now route through toolError()/redact() like the rest of the surface. This is a
  // leak-channel test — treat a change here as a security change.
  describe("error redaction", () => {
    const cases: Array<[string, any, jest.Mock<any>, object]> = [
      ["bags_get_claimable_fees", GetClaimableFeesTool, mockBagsClient.fee.getAllClaimablePositions, { walletAddress: SYSTEM_PROGRAM }],
      ["bags_get_trade_quote", GetTradeQuoteTool, mockBagsClient.trade.getQuote, { inputMint: SOL_MINT, outputMint: SYSTEM_PROGRAM, amount: 1, side: "buy" }],
      ["bags_get_creators", GetCreatorsTool, mockBagsClient.state.getTopTokensByLifetimeFees, {}],
      ["bags_get_token_analytics", GetTokenAnalyticsTool, mockBagsClient.state.getTokenLifetimeFees, { tokenMint: SOL_MINT }],
      ["bags_get_partner_stats", GetPartnerStatsTool, mockBagsClient.partner.getPartnerConfigClaimStats, { partnerId: SOL_MINT }],
      ["bags_heartbeat", HeartbeatTool, mockBagsClient.fee.getAllClaimablePositions, {}],
    ];

    it.each(cases)("%s never echoes key-shaped strings from errors", async (name, tool, sdkMethod, args) => {
      sdkMethod.mockRejectedValueOnce(new Error(`request failed: ${KEY_SHAPED_BASE58}`));
      const { server, getHandler } = createMockServer();
      tool.registerTool(server);
      const result = await getHandler(name)(args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain(KEY_SHAPED_BASE58);
      expect(result.content[0].text).toContain("[REDACTED_BASE58]");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });
  });
});
