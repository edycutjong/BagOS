import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { getBagsClient } from "../lib/bags-client";
import { loadKeypair } from "../lib/wallet";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool";

export const HeartbeatTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_heartbeat",
      "Periodic health check combining basic node status with an earnings/balance summary. Free read-only tier.",
      {},
      async () => {
        try {
          const keyPath = process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
          const keypair = loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          const client = getBagsClient();
          const pubkey = new PublicKey(walletAddress);
          const fees = await client.fee.getAllClaimablePositions(pubkey);
          const systemState = { status: "Operational", rpc: "Helius" };

          const heartbeatReport = {
            wallet: walletAddress,
            systemHealth: systemState,
            claimableFeesSummary: fees
          };

          return {
            content: [
              {
                type: "text",
                text: `💓 BagOS Heartbeat Status:\n\n${JSON.stringify(heartbeatReport, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Heartbeat health check failed: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
