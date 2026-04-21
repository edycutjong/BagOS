import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const GetTradeQuoteTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    const bosMint = process.env.BOS_TOKEN_MINT || "EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS";

    server.tool(
      "bags_get_trade_quote",
      `Get a swap quote to trade SOL and any Bags ecosystem token. Free read-only tier. SOL mint: ${SOL_MINT}. Default BOS token mint: ${bosMint}.`,
      {
        inputMint: z.string().optional().describe(`Input token mint address. Defaults to SOL: ${SOL_MINT}`),
        outputMint: z.string().optional().describe(`Output token mint address. Defaults to BOS: ${bosMint}`),
        amount: z.number().describe("Amount of input token to swap in human-readable units (e.g., 0.1 for 0.1 SOL)."),
        side: z.enum(["buy", "sell"]).describe("Is this a buy or sell action?")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();
          
          const resolvedInput = args.inputMint || SOL_MINT;
          const resolvedOutput = args.outputMint || bosMint;
          
          // Convert human-readable amount to lamports (API expects integer lamports)
          const lamports = Math.round(args.amount * 1e9);
          
          const quote = await client.trade.getQuote({
            inputMint: new PublicKey(resolvedInput),
            outputMint: new PublicKey(resolvedOutput),
            amount: lamports
          });

          return {
            content: [
              {
                type: "text",
                text: `Trade Quote:\nRequested ${args.side} of ${args.amount} ${resolvedInput} for ${resolvedOutput}.\n\nResults:\n${JSON.stringify(quote, null, 2)}`
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

