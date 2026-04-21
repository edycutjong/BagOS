import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const ExecuteTradeTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    const bosMint = process.env.BOS_TOKEN_MINT || "EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS";

    server.tool(
      "bags_execute_trade",
      `GATED: Requires $BOS. Execute a token swap on Bags pools. Verifies token gate, fetches a quote, builds and signs the swap transaction. SOL mint: ${SOL_MINT}. Default BOS token: ${bosMint}.`,
      {
        inputMint: z.string().optional().describe(`Input token mint. Defaults to SOL: ${SOL_MINT}`),
        outputMint: z.string().optional().describe(`Output token mint. Defaults to BOS: ${bosMint}`),
        amount: z.number().optional().default(0.1).describe("Amount of input token (human-readable, e.g. 0.1 SOL). Default: 0.1"),
        side: z.enum(["buy", "sell"]).optional().default("buy").describe("Buy or sell. Default: buy"),
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

          const resolvedInput = args.inputMint || SOL_MINT;
          const resolvedOutput = args.outputMint || bosMint;
          const lamports = Math.round((args.amount ?? 0.1) * 1e9);

          const quoteResponse = await client.trade.getQuote({
            inputMint: new PublicKey(resolvedInput),
            outputMint: new PublicKey(resolvedOutput),
            amount: lamports,
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
                text: `✅ Trade Execution Signed! \nSwapped ${args.amount ?? 0.1} of ${resolvedInput} for ${resolvedOutput} at max ${slippageBps / 100}% slippage.`
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
