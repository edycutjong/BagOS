import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

export const GetTokenClaimEventsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_token_claim_events",
      "Get the fee-claim audit trail for a token: who claimed, how much, when, and the transaction signature. Paginated via limit/offset. Free read-only tier.",
      {
        tokenMint: z.string().describe("The token mint address to get claim events for"),
        limit: z.number().int().min(1).optional().describe("Maximum number of events to return (default 100)"),
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();

          const pubkey = new PublicKey(args.tokenMint);
          const limit = args.limit ?? 100;
          const offset = args.offset ?? 0;
          const events = await client.state.getTokenClaimEvents(pubkey, { limit, offset });

          return {
            content: [
              {
                type: "text",
                text: `Claim Events for Token Mint ${args.tokenMint} (${events.length} event(s), limit ${limit}, offset ${offset}):\n\n${JSON.stringify(events, null, 2)}`
              }
            ]
          };
        } catch (error) {
          return toolError(error);
        }
      }
    );
  }
};
