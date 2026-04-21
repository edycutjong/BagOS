import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";

export const ClaimFeesTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_claim_fees",
      "GATED: Requires $BOS. Claim pending creator/LP fees for specified token mints.",
      {
        tokenMints: z.array(z.string()).min(1).describe("Array of token mint addresses to claim fees for.")
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
                { type: "text", text: `❌ Access Denied: You have ${gate.balance} $BOS. You need at least ${process.env.BOS_REQUIRED_BALANCE || 10000} $BOS to execute fee claims.` }
              ],
              isError: true,
            };
          }

          const client = BagsClient.getBagsClient();
          const pubkey = new PublicKey(walletAddress);
          
          for (const token of args.tokenMints) {
            const tokenPubkey = new PublicKey(token);
            await client.fee.getClaimTransactions(pubkey, tokenPubkey);
          }
          
          return {
            content: [
              {
                type: "text",
                text: `✅ Action execution signed successfully.\nFee claims requested for:\n${args.tokenMints.join("\n")}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Claiming fees failed: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
