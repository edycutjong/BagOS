import { createMockServer, createMockBagsClient } from "../helpers.js";
import { jest } from "@jest/globals";

// Use real Solana addresses (SOL native mint, System Program)
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

// A base58 string long enough to be key-shaped (>= 80 chars). If an SDK error
// ever carries something like this, the tool must redact it — same leak-channel
// bar as authenticate.test.ts.
const KEY_SHAPED_BASE58 = "5".repeat(88);

const mockBagsClient = createMockBagsClient();
import { BagsClient } from "../../lib/bags-client.js";
jest.spyOn(BagsClient, "getBagsClient").mockReturnValue(mockBagsClient as any);

import { GetTokenClaimStatsTool } from "../../tools/GetTokenClaimStats";
import { GetTokenClaimEventsTool } from "../../tools/GetTokenClaimEvents";
import { GetTokenCreatorsTool } from "../../tools/GetTokenCreators";
import { ResolveLaunchWalletTool } from "../../tools/ResolveLaunchWallet";

describe("State read-only MCP Tools", () => {
  describe("GetTokenClaimStats", () => {
    it("registers and returns per-creator claim totals", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenClaimStatsTool.registerTool(server);
      expect(server.tool).toHaveBeenCalledWith(
        "bags_get_token_claim_stats",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );

      const result = await getHandler("bags_get_token_claim_stats")({
        tokenMint: SOL_MINT,
      });
      expect(result.content[0].text).toContain("Claim Stats");
      expect(result.content[0].text).toContain("1 creator(s)");
      expect(result.content[0].text).toContain("alice");
      expect(result.content[0].text).toContain("1500000");
      expect(result.isError).toBeUndefined();
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getTokenClaimStats.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetTokenClaimStatsTool.registerTool(server);
      const result = await getHandler("bags_get_token_claim_stats")({ tokenMint: SOL_MINT });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
      expect(result.content[0].text).not.toContain("at "); // no stack trace
    });

    it("returns error for an invalid mint address", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenClaimStatsTool.registerTool(server);
      const result = await getHandler("bags_get_token_claim_stats")({ tokenMint: "not-a-pubkey" });
      expect(result.isError).toBe(true);
    });
  });

  describe("GetTokenClaimEvents", () => {
    it("registers and returns the claim audit trail with defaults", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenClaimEventsTool.registerTool(server);
      expect(server.tool).toHaveBeenCalledWith(
        "bags_get_token_claim_events",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );

      const result = await getHandler("bags_get_token_claim_events")({
        tokenMint: SOL_MINT,
      });
      expect(result.content[0].text).toContain("Claim Events");
      expect(result.content[0].text).toContain("limit 100, offset 0");
      expect(result.content[0].text).toContain("5igNaTure111");
      expect(result.isError).toBeUndefined();
      expect(mockBagsClient.state.getTokenClaimEvents).toHaveBeenLastCalledWith(
        expect.anything(),
        { limit: 100, offset: 0 }
      );
    });

    it("passes explicit limit and offset through to the SDK", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenClaimEventsTool.registerTool(server);

      const result = await getHandler("bags_get_token_claim_events")({
        tokenMint: SOL_MINT,
        limit: 5,
        offset: 20,
      });
      expect(result.content[0].text).toContain("limit 5, offset 20");
      expect(result.isError).toBeUndefined();
      expect(mockBagsClient.state.getTokenClaimEvents).toHaveBeenLastCalledWith(
        expect.anything(),
        { limit: 5, offset: 20 }
      );
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getTokenClaimEvents.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetTokenClaimEventsTool.registerTool(server);
      const result = await getHandler("bags_get_token_claim_events")({ tokenMint: SOL_MINT });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
    });
  });

  describe("GetTokenCreators", () => {
    it("registers and returns the royalty split", async () => {
      const { server, getHandler } = createMockServer();
      GetTokenCreatorsTool.registerTool(server);
      expect(server.tool).toHaveBeenCalledWith(
        "bags_get_token_creators",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );

      const result = await getHandler("bags_get_token_creators")({
        tokenMint: SOL_MINT,
      });
      expect(result.content[0].text).toContain("Creators for Token Mint");
      expect(result.content[0].text).toContain("alice");
      expect(result.content[0].text).toContain("10000");
      expect(result.isError).toBeUndefined();
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getTokenCreators.mockRejectedValueOnce(new Error("API Error"));
      const { server, getHandler } = createMockServer();
      GetTokenCreatorsTool.registerTool(server);
      const result = await getHandler("bags_get_token_creators")({ tokenMint: SOL_MINT });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API Error");
    });
  });

  describe("ResolveLaunchWallet", () => {
    it("registers and resolves a handle to its launch wallet", async () => {
      const { server, getHandler } = createMockServer();
      ResolveLaunchWalletTool.registerTool(server);
      expect(server.tool).toHaveBeenCalledWith(
        "bags_resolve_launch_wallet",
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );

      const result = await getHandler("bags_resolve_launch_wallet")({
        username: "alice",
        provider: "twitter",
      });
      expect(result.content[0].text).toContain(`Launch wallet for twitter user "alice"`);
      expect(result.content[0].text).toContain(SYSTEM_PROGRAM);
      expect(result.content[0].text).toContain("Alice");
      expect(result.isError).toBeUndefined();
      expect(mockBagsClient.state.getLaunchWalletV2).toHaveBeenLastCalledWith("alice", "twitter");
    });

    it("strips a leading @ from the username", async () => {
      const { server, getHandler } = createMockServer();
      ResolveLaunchWalletTool.registerTool(server);

      const result = await getHandler("bags_resolve_launch_wallet")({
        username: "@alice",
        provider: "github",
      });
      expect(result.content[0].text).toContain(`github user "alice"`);
      expect(result.isError).toBeUndefined();
      expect(mockBagsClient.state.getLaunchWalletV2).toHaveBeenLastCalledWith("alice", "github");
    });

    it("returns error on SDK failure", async () => {
      mockBagsClient.state.getLaunchWalletV2.mockRejectedValueOnce(new Error("User not found"));
      const { server, getHandler } = createMockServer();
      ResolveLaunchWalletTool.registerTool(server);
      const result = await getHandler("bags_resolve_launch_wallet")({
        username: "nobody",
        provider: "kick",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("User not found");
    });
  });

  // Leak-channel bar (same standard as authenticate.test.ts): if an SDK error
  // message ever contains key-shaped material, the tool response must carry the
  // redaction placeholder, never the raw string.
  describe("error redaction", () => {
    const cases: Array<[string, any, jest.Mock<any>, (args?: object) => object]> = [
      ["bags_get_token_claim_stats", GetTokenClaimStatsTool, mockBagsClient.state.getTokenClaimStats, () => ({ tokenMint: SOL_MINT })],
      ["bags_get_token_claim_events", GetTokenClaimEventsTool, mockBagsClient.state.getTokenClaimEvents, () => ({ tokenMint: SOL_MINT })],
      ["bags_get_token_creators", GetTokenCreatorsTool, mockBagsClient.state.getTokenCreators, () => ({ tokenMint: SOL_MINT })],
      ["bags_resolve_launch_wallet", ResolveLaunchWalletTool, mockBagsClient.state.getLaunchWalletV2, () => ({ username: "alice", provider: "twitter" })],
    ];

    it.each(cases)("%s never echoes key-shaped strings from errors", async (name, tool, sdkMethod, argsOf) => {
      sdkMethod.mockRejectedValueOnce(new Error(`request failed: ${KEY_SHAPED_BASE58}`));
      const { server, getHandler } = createMockServer();
      tool.registerTool(server);
      const result = await getHandler(name)(argsOf());
      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain(KEY_SHAPED_BASE58);
      expect(result.content[0].text).toContain("[REDACTED_BASE58]");
    });
  });
});
