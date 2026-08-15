import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

export const GetTokenCreatorsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_token_creators",
      "Get the royalty split for a token: every creator sharing its fees, their wallet, social provider, and share in basis points. Free read-only tier.",
      {
        tokenMint: z.string().describe("The token mint address to look up creators for")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();

          const pubkey = new PublicKey(args.tokenMint);
          const creators = await client.state.getTokenCreators(pubkey);

          return {
            content: [
              {
                type: "text",
                text: `Creators for Token Mint ${args.tokenMint} (${creators.length} creator(s)):\n\n${JSON.stringify(creators, null, 2)}`
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
