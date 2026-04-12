import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { getBagsClient } from "../lib/bags-client";
import { loadKeypair } from "../lib/wallet";
import { checkTokenGate } from "../lib/token-gate";
import { IMcpTool } from "../types/IMcpTool";

export const LaunchTokenTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_launch_token",
      "GATED: Requires $BOS. Create metadata and launch a new token on Bags.",
      {
        name: z.string().describe("The full name of the new token"),
        symbol: z.string().describe("The ticker symbol"),
        description: z.string().describe("Description for the token"),
        imageUrl: z.string().optional().describe("URL link to the token image"),
        initialBuySOL: z.number().optional().describe("Optional initial SOL to buy for bootstrapping liquidity")
      },
      async (args) => {
        try {
          const keyPath = process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
          const keypair = loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          // Gate check
          const gate = await checkTokenGate(walletAddress);
          if (!gate.allowed) {
            return {
              content: [
                { type: "text", text: `❌ Access Denied: You have ${gate.balance} $BOS. You need at least ${process.env.BOS_REQUIRED_BALANCE || 10000} $BOS to launch tokens.` }
              ],
              isError: true,
            };
          }

          const client = getBagsClient();
          
          await client.tokenLaunch.create({
            walletAddress: walletAddress,
            name: args.name,
            symbol: args.symbol,
            description: args.description,
            imageUrl: args.imageUrl,
            initialBuySOL: args.initialBuySOL
          });

          return {
            content: [
              {
                type: "text",
                text: `✅ Success! Token Launch execution initiated for $${args.symbol} (${args.name}).`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Build & Execute token launch failed: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
