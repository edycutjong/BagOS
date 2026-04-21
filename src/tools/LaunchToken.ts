import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";

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
          const keypair = Wallet.loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          // Gate check
          const gate = await TokenGate.checkTokenGate(walletAddress);
          if (!gate.allowed) {
            return {
              content: [
                { type: "text", text: `❌ Access Denied: You have ${gate.balance} $BOS. You need at least ${process.env.BOS_REQUIRED_BALANCE || 10000} $BOS to launch tokens.` }
              ],
              isError: true,
            };
          }

          const client = BagsClient.getBagsClient();
          
          const response = await client.tokenLaunch.createTokenInfoAndMetadata({
            name: args.name,
            symbol: args.symbol,
            description: args.description,
            imageUrl: args.imageUrl || "https://bags.fm/logo.png"
          });
          
          return {
            content: [
              {
                type: "text",
                text: `✅ Token metadata created for ${args.symbol}.\nMint: ${response.tokenMint}`
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
