import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { Wallet } from "../lib/wallet.js";
import { TokenGate } from "../lib/token-gate.js";
import { IMcpTool } from "../types/IMcpTool.js";
import { Executor } from "../lib/execute.js";
import { networkBanner } from "../lib/network.js";
import {
  assertWithinCaps,
  recordSpend,
  confirmationRequired,
  issueToken,
  consumeToken,
  previewText,
} from "../lib/guards.js";
import { toolError } from "../lib/mcp-utils.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOOL_NAME = "bags_execute_trade";

export const ExecuteTradeTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    const bosMint = process.env['BOS_TOKEN_MINT'] || "EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS";

    server.tool(
      TOOL_NAME,
      `GATED WRITE: Swap tokens on Bags pools. Requires $BOS. Two-step: the first call returns a preview and a confirmation token; call again with that token to sign and submit. Returns a confirmed on-chain signature. SOL mint: ${SOL_MINT}.`,
      {
        inputMint: z.string().optional().describe(`Input token mint. Defaults to SOL: ${SOL_MINT}`),
        outputMint: z.string().optional().describe(`Output token mint. Defaults to BOS: ${bosMint}`),
        amount: z.number().positive().optional().default(0.1).describe("Amount of the input token, human-readable (e.g. 0.1 SOL). Default: 0.1"),
        slippageBps: z.number().int().min(1).max(10_000).optional().describe("Allowed slippage in basis points. Default 300 (3%)."),
        confirm: z.string().optional().describe("Confirmation token from the preview call. Omit on the first call.")
      },
      async (args) => {
        try {
          const keyPath = process.env['BAGS_KEYPAIR_PATH'] || "~/.config/bags/keypair.json";
          const keypair = Wallet.loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          const gate = await TokenGate.checkTokenGate(walletAddress);
          if (!gate.allowed) {
            return toolError(
              `Access denied: wallet holds ${gate.balance} $BOS, but ${process.env['BOS_REQUIRED_BALANCE'] || 10000} is required to trade.`
            );
          }

          const resolvedInput = args.inputMint || SOL_MINT;
          const resolvedOutput = args.outputMint || bosMint;
          const amount = args.amount ?? 0.1;
          const slippageBps = args.slippageBps ?? 300;

          // Caps are denominated in SOL, so they bind only when SOL is what
          // leaves the wallet. Selling a token for SOL spends ~0 SOL.
          const solSpend = resolvedInput === SOL_MINT ? amount : 0;
          assertWithinCaps(solSpend);

          // The token authorizes this exact argument set, minus the token itself.
          const { confirm, ...action } = args;

          const client = BagsClient.getBagsClient();
          const quoteResponse = await client.trade.getQuote({
            inputMint: new PublicKey(resolvedInput),
            outputMint: new PublicKey(resolvedOutput),
            amount: Math.round(amount * 1e9),
            slippageBps
          });

          if (confirmationRequired() && !confirm) {
            const token = issueToken(TOOL_NAME, action, solSpend);
            return {
              content: [{
                type: "text",
                text: previewText({
                  action: `Swap ${amount} of ${resolvedInput}`,
                  amountSol: solSpend,
                  details: [
                    `for       ${resolvedOutput}`,
                    `expect    ${quoteResponse.outAmount} (min ${quoteResponse.minOutAmount})`,
                    `slippage  ${slippageBps / 100}%`,
                    `wallet    ${walletAddress}`,
                    `network   ${networkBanner()}`,
                  ],
                  token,
                  toolName: TOOL_NAME,
                })
              }]
            };
          }

          if (confirmationRequired()) {
            consumeToken(confirm!, TOOL_NAME, action);
          }

          const { transaction } = await client.trade.createSwapTransaction({
            userPublicKey: new PublicKey(walletAddress),
            quoteResponse
          });

          const result = await Executor.executeTransaction(transaction, keypair);
          recordSpend(solSpend);

          return {
            content: [{
              type: "text",
              text: [
                `✅ Swap confirmed on chain. ${networkBanner()}`,
                ``,
                `Signature: ${result.signature}`,
                `Explorer:  ${result.explorer}`,
                `Slot:      ${result.slot ?? "unknown"}`,
                ``,
                `Swapped ${amount} of ${resolvedInput} for ${resolvedOutput} at max ${slippageBps / 100}% slippage.`,
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
