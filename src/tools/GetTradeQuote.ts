import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";

export const GetTradeQuoteTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_trade_quote",
      "Get a swap quote to trade SOL and any Bags ecosystem token. Free read-only tier.",
      {
        inputMint: z.string().describe("Input token mint address (e.g., SOL mint)."),
        outputMint: z.string().describe("Output token mint address."),
        amount: z.number().describe("Amount of input token to swap."),
        side: z.enum(["buy", "sell"]).describe("Is this a buy or sell action?")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();
          
          const quote = await client.trade.getQuote({
            inputMint: new PublicKey(args.inputMint),
            outputMint: new PublicKey(args.outputMint),
            amount: args.amount
          });

          return {
            content: [
              {
                type: "text",
                text: `Trade Quote:\nRequested ${args.side} of ${args.amount} ${args.inputMint} for ${args.outputMint}.\n\nResults:\n${JSON.stringify(quote, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Failed to fetch quote: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
