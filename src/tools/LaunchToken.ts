import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";
import { networkBanner } from "../lib/network.js";
import { toolError } from "../lib/mcp-utils.js";

const TOOL_NAME = "bags_prepare_token_metadata";

/**
 * Renamed from `bags_launch_token` in v2.0.0.
 *
 * The previous name and description claimed this tool launched a token. It did
 * not — it only called `createTokenInfoAndMetadata`, and reported success. A
 * real launch additionally requires a Meteora fee-share config (see
 * ConfigService.createBagsFeeShareConfig) and a signed launch transaction from
 * TokenLaunchService.createLaunchTransaction. That flow needs a fee-claimer
 * split that this server has no way to choose on the user's behalf, so it is
 * deliberately not implemented rather than faked.
 */
export const LaunchTokenTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      TOOL_NAME,
      "GATED: Create token info and metadata on Bags, returning the reserved mint address and metadata URL. Requires $BOS. This PREPARES a launch — it does not launch the token and does not send an on-chain transaction.",
      {
        name: z.string().min(1).max(64).describe("The full name of the new token"),
        symbol: z.string().min(1).max(16).describe("The ticker symbol"),
        description: z.string().min(1).max(512).describe("Description for the token"),
        imageUrl: z.string().url().optional().describe("URL of the token image")
      },
      async (args) => {
        try {
          const keyPath = process.env['BAGS_KEYPAIR_PATH'] || "~/.config/bags/keypair.json";
          const keypair = Wallet.loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          const gate = await TokenGate.checkTokenGate(walletAddress);
          if (!gate.allowed) {
            return toolError(
              `Access denied: wallet holds ${gate.balance} $BOS, but ${process.env['BOS_REQUIRED_BALANCE'] || 10000} is required.`
            );
          }

          const client = BagsClient.getBagsClient();
          const response = await client.tokenLaunch.createTokenInfoAndMetadata({
            name: args.name,
            symbol: args.symbol,
            description: args.description,
            imageUrl: args.imageUrl || "https://bags.fm/logo.png"
          });

          return {
            content: [{
              type: "text",
              text: [
                `✅ Metadata prepared for ${args.symbol}. ${networkBanner()}`,
                ``,
                `Mint:     ${response.tokenMint}`,
                `Metadata: ${response.tokenMetadata}`,
                ``,
                `⚠️  NOT LAUNCHED. No on-chain transaction was sent and no funds moved.`,
                `Completing a launch additionally requires a Meteora fee-share config`,
                `and a signed launch transaction. This server does not implement that`,
                `step, because the fee-claimer split has to be your decision.`,
                `Finish the launch at https://bags.fm.`,
              ].join("\n")
            }]
          };
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }
};
