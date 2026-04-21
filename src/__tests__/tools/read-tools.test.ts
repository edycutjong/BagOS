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

describe("Read-only MCP Tools", () => {
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

    it("returns error on SDK failure", async () => {
      mockBagsClient.fee.getAllClaimablePositions.mockRejectedValueOnce(new Error("RPC down"));
      const { server, getHandler } = createMockServer();
      GetClaimableFeesTool.registerTool(server);
      const result = await getHandler("bags_get_claimable_fees")({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("RPC down");
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
    });
  });
});
