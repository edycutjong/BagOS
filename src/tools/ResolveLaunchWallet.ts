import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

export const ResolveLaunchWalletTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_resolve_launch_wallet",
      "Resolve a social handle (twitter, tiktok, kick, or github) to its Bags fee-share launch wallet. Free read-only tier.",
      {
        username: z.string().describe("The username to resolve (a leading @ is stripped automatically)"),
        provider: z.enum(["twitter", "tiktok", "kick", "github"]).describe("The social platform the username belongs to")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();

          const username = args.username.replace(/^@/, "");
          const result = await client.state.getLaunchWalletV2(username, args.provider);

          return {
            content: [
              {
                type: "text",
                text: `Launch wallet for ${args.provider} user "${username}":\n\nWallet: ${result.wallet.toBase58()}\n\nPlatform data:\n${JSON.stringify(result.platformData, null, 2)}`
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
