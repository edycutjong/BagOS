import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { getBagsClient } from "../lib/bags-client";
import { loadKeypair } from "../lib/wallet";
import { IMcpTool } from "../types/IMcpTool";

export const GetClaimableFeesTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_claimable_fees",
      "Query all claimable creator/LP fees for a wallet. Free read-only tier.",
      {
        walletAddress: z.string().optional().describe("Wallet address to check. Defaults to the local keypair wallet if omitted.")
      },
      async (args) => {
        try {
          let targetWallet = args.walletAddress;

          // If no wallet specified, default to our local keypair
          if (!targetWallet) {
            const keyPath = process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
            const keypair = loadKeypair(keyPath);
            targetWallet = keypair.publicKey.toBase58();
          }

          const client = getBagsClient();
          // SDK call representation
          // Assuming the sdk.fee namespace or similar from bags-sdk
          const fees = await client.fee.getClaimableFees(targetWallet);

          return {
            content: [
              {
                type: "text",
                text: `Claimable Fees for ${targetWallet}:\n\n${JSON.stringify(fees, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Failed to fetch fees: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
