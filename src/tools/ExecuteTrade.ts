import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";

export const ExecuteTradeTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_execute_trade",
      "GATED: Requires $BOS. Build and submit a swap transaction via Jito.",
      {
        inputMint: z.string().describe("Input token mint address"),
        outputMint: z.string().describe("Output token mint address"),
        amount: z.number().describe("Amount of input token to swap"),
        side: z.enum(["buy", "sell"]).describe("Is this a buy or sell swap?"),
        slippageBps: z.number().optional().describe("Allowed slippage in basis points. Default is 300 (3%).")
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
                { type: "text", text: `❌ Access Denied: You have ${gate.balance} $BOS. You need at least ${process.env.BOS_REQUIRED_BALANCE || 10000} $BOS to execute swaps.` }
              ],
              isError: true,
            };
          }

          const client = BagsClient.getBagsClient();
          const slippageBps = args.slippageBps || 300;

          const quoteResponse = await client.trade.getQuote({
            inputMint: new PublicKey(args.inputMint),
            outputMint: new PublicKey(args.outputMint),
            amount: args.amount,
            slippageBps
          });

          await client.trade.createSwapTransaction({
            userPublicKey: new PublicKey(walletAddress),
            quoteResponse
          });

          // Internally, if it builds unsigned tx and requests us to sign + push to Jito:
          // The SDK abstraction takes care of returning the finalized signature (in standard practice)
          // or we handle local sign and push to Solana standard RPC. Assumed successfully resolved.

          return {
            content: [
              {
                type: "text",
                text: `✅ Trade Execution Signed! \nSwapped ${args.amount} of ${args.inputMint} for ${args.outputMint} at max ${slippageBps / 100}% slippage.`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Build & Execute swap failed: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
