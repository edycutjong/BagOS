import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { Wallet } from "../lib/wallet.js";
import { IMcpTool } from "../types/IMcpTool.js";

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
            const keypair = Wallet.loadKeypair(keyPath);
            targetWallet = keypair.publicKey.toBase58();
          }

          const client = BagsClient.getBagsClient();
          const pubkey = new PublicKey(targetWallet);
          const claimable = await client.fee.getAllClaimablePositions(pubkey);

          return {
            content: [
              {
                type: "text",
                text: `Claimable Fees for ${targetWallet}:\n\n${JSON.stringify(claimable, null, 2)}`
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
