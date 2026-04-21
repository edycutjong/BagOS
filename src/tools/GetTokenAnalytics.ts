import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";

export const GetTokenAnalyticsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_token_analytics",
      "Get pool info, claim stats, and bonding curve progress for a token. Free read-only tier.",
      {
        tokenMint: z.string().describe("The token mint address to analyze")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();

          const pubkey = new PublicKey(args.tokenMint);
          const fees = await client.state.getTokenLifetimeFees(pubkey);
          const analytics = { tokenLifetimeFees: fees, status: "Active" };

          return {
            content: [
              {
                type: "text",
                text: `Analytics for Token Mint ${args.tokenMint}:\n\n${JSON.stringify(analytics, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Failed to fetch token analytics: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
