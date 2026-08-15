import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

export const GetTokenClaimStatsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_token_claim_stats",
      "Get per-creator claim totals for a token: each fee-share creator with their royalty split and total claimed amount. Free read-only tier.",
      {
        tokenMint: z.string().describe("The token mint address to get claim stats for")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();

          const pubkey = new PublicKey(args.tokenMint);
          const stats = await client.state.getTokenClaimStats(pubkey);

          return {
            content: [
              {
                type: "text",
                text: `Claim Stats for Token Mint ${args.tokenMint} (${stats.length} creator(s)):\n\n${JSON.stringify(stats, null, 2)}`
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
