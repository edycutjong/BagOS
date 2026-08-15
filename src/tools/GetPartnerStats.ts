import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

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
          const client = BagsClient.getBagsClient();
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
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }
};
