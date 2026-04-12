import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { getBagsClient } from "../lib/bags-client";
import { IMcpTool } from "../types/IMcpTool";
import { loadKeypair } from "../lib/wallet";

export const GetPartnerStatsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_partner_stats",
      "View partner referral earnings for the configured wallet. Free read-only tier.",
      {},
      async () => {
        try {
          const keyPath = process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
          const keypair = loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          const client = getBagsClient();
          const partnerStats = await client.partner.getPartnerStats?.(walletAddress) || { message: "Mocked partner stats for hackathon SDK placeholder" };

          return {
            content: [
              {
                type: "text",
                text: `Partner Referral Stats for ${walletAddress}:\n\n${JSON.stringify(partnerStats, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Failed to fetch partner stats: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
