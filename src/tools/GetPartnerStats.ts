import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { getBagsClient } from "../lib/bags-client";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool";

export const GetPartnerStatsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_partner_stats",
      "View partner referral earnings for the configured wallet. Free read-only tier.",
      {
        partnerId: z.string().describe("The partner's public key address"),
      },
      async ({ partnerId }) => {
        try {
          const client = getBagsClient();
          const pubkey = new PublicKey(partnerId);
          const stats = await client.partner.getPartnerConfigClaimStats(pubkey);

          return {
            content: [
              {
                type: "text",
                text: `Partner Referral Stats for ${partnerId}:\n\n${JSON.stringify(stats, null, 2)}`
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
