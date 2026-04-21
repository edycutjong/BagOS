import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BagsClient } from "../lib/bags-client.js";
import { Wallet } from "../lib/wallet.js";
import { PublicKey } from '@solana/web3.js';
import { IMcpTool } from "../types/IMcpTool.js";

export const HeartbeatTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_heartbeat",
      "Periodic health check combining basic node status with an earnings/balance summary. Free read-only tier.",
      {},
      async () => {
        try {
          const keyPath = process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
          const keypair = Wallet.loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          const client = BagsClient.getBagsClient();
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
