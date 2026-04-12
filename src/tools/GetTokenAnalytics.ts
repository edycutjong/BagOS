import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { getBagsClient } from "../lib/bags-client";
import { IMcpTool } from "../types/IMcpTool";

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
          const client = getBagsClient();

          const analytics = await client.state.getTokenAnalytics?.(args.tokenMint) || { message: "Mocked analytics data for hackathon API placeholder" };

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
