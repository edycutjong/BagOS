import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Wallet } from "../lib/wallet.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { IMcpTool } from "../types/IMcpTool.js";
import fs from "fs";
import * as path from "path";

export const AuthenticateTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_authenticate",
      "Authenticate with Bags API utilizing the V2 signature challenge flow. Automatically loads local wallet.",
      {
        privateKeyPath: z.string().optional().describe("Optional path to the wallet keypair. Defaults to ~/.config/bags/keypair.json or BAGS_KEYPAIR_PATH env var."),
      },
      async (args) => {
        try {
          const keyPath = args.privateKeyPath || process.env.BAGS_KEYPAIR_PATH || "~/.config/bags/keypair.json";
          const keypair = Wallet.loadKeypair(keyPath);
          const walletAddress = keypair.publicKey.toBase58();

          // Standard API client to hit auth endpoints manually because Bags SDK init requires the API key
          // and we might be fetching the API key here
          const baseUrl = process.env.BAGS_API_URL || "https://public-api-v2.bags.fm";

          // Step 1: Init auth challenge
          const initRes = await fetch(`${baseUrl}/agent/v2/auth/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: walletAddress })
          });

          if (!initRes.ok) {
            const errBody = await initRes.text();
            throw new Error(`Init auth failed: ${initRes.status} ${errBody}`);
          }

          const initData = await initRes.json();
          if (!initData.message || !initData.nonce) {
             throw new Error("Invalid response from auth/init, expected message and nonce.");
          }

          // Step 2: Sign message
          const messageBytes = bs58.decode(initData.message);
          const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
          const signatureBase58 = bs58.encode(signatureBytes);

          // Step 3: Callback with signature
          const callbackRes = await fetch(`${baseUrl}/agent/v2/auth/callback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address: walletAddress,
              nonce: initData.nonce,
              signature: signatureBase58
            })
          });

          if (!callbackRes.ok) {
             const errBody = await callbackRes.text();
             throw new Error(`Auth callback failed: ${callbackRes.status} ${errBody}`);
          }

          const callbackData = await callbackRes.json();

          // Store the obtained keys if desired or just return them
          const credentials = {
            apiKey: callbackData.apiKey,
            keyId: callbackData.keyId,
            wallet: walletAddress
          };
          
          let savePathMessage = "";
          try {
            const configDir = path.dirname(keyPath.replace("~", process.env.HOME || ""));
            const credPath = path.join(configDir, "credentials.json");
            if (fs.existsSync(configDir)) {
               fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));
               savePathMessage = `\nCredentials saved to ${credPath}`;
            }
          } catch(e) {
            console.error("Could not save credentials", e);
          }

          // If the user's .env didn't have API key, they can now add it.
          // In a real flow, we'd dynamically update our singleton or file.
          return {
            content: [
              {
                type: "text",
                text: `✅ Successfully authenticated with Bags API.\nWallet: ${walletAddress}\nKey ID: ${callbackData.keyId}\nAPI Key: ${callbackData.apiKey}${savePathMessage}\n\nPlease add this API key to your .env file as BAGS_API_KEY.`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Authentication failed: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
