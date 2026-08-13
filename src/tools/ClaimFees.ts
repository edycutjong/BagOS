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
  confirmationRequired,
  issueToken,
  consumeToken,
  previewText,
} from "../lib/guards.js";
import { toolError } from "../lib/mcp-utils.js";

const TOOL_NAME = "bags_claim_fees";

export const ClaimFeesTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      TOOL_NAME,
      "GATED WRITE: Claim pending creator/LP fees for the given token mints. Requires $BOS. Two-step: the first call previews and returns a confirmation token; call again with it to sign and submit. Returns confirmed on-chain signatures.",
      {
        tokenMints: z.array(z.string()).min(1).max(10).describe("Token mint addresses to claim fees for (max 10)."),
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
              `Access denied: wallet holds ${gate.balance} $BOS, but ${process.env['BOS_REQUIRED_BALANCE'] || 10000} is required to claim fees.`
            );
          }

          const { confirm, ...action } = args;
          const client = BagsClient.getBagsClient();
          const pubkey = new PublicKey(walletAddress);

          // Gather the real claim transactions before previewing, so the
          // preview reflects what would actually be submitted.
          const transactions = [];
          for (const mint of args.tokenMints) {
            const txs = await client.fee.getClaimTransactions(pubkey, new PublicKey(mint));
            transactions.push(...txs);
          }

          if (transactions.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No claimable fees found for ${args.tokenMints.length} mint(s). Nothing to do.`
              }]
            };
          }

          if (confirmationRequired() && !confirm) {
            const token = issueToken(TOOL_NAME, action, 0);
            return {
              content: [{
                type: "text",
                text: previewText({
                  action: `Claim fees across ${args.tokenMints.length} mint(s)`,
                  amountSol: 0,
                  details: [
                    `transactions  ${transactions.length} to submit`,
                    `mints         ${args.tokenMints.join(", ")}`,
                    `wallet        ${walletAddress}`,
                    `network       ${networkBanner()}`,
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

          const { executed, failedAt, error } = await Executor.executeAll(transactions, keypair);

          const lines = [
            failedAt === null
              ? `✅ Claimed fees across ${args.tokenMints.length} mint(s). ${networkBanner()}`
              : `⚠️  Partial claim. ${executed.length} of ${transactions.length} transactions confirmed. ${networkBanner()}`,
            ``,
            ...executed.map((r, i) => `  ${i + 1}. ${r.signature}\n     ${r.explorer}`),
          ];

          if (failedAt !== null) {
            lines.push(
              ``,
              `Transaction ${failedAt + 1} failed: ${error?.message ?? "unknown error"}`,
              `Remaining transactions were not submitted.`
            );
            return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
          }

          return { content: [{ type: "text", text: lines.join("\n") }] };
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }
};
