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
          const baseUrl = process.env.BAGS_API_URL || "https://public-api-v2.bags.fm/api/v1";

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

          const initRaw = await initRes.json();
          const initData = initRaw.response || initRaw;
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

          const callbackRaw = await callbackRes.json();
          const callbackData = callbackRaw.response || callbackRaw;

          // Validate before this touches the filesystem. CodeQL js/http-to-file-access
          // flagged the write below as "file system write depends on untrusted data", and
          // it was right: the response body was persisted verbatim. The path never came
          // from the network, so this was not a traversal, but an upstream that returned
          // a huge or wrong-typed body would still have been written to disk unchecked.
          // Only these three fields are stored, only as strings, only within sane bounds.
          const CredentialsSchema = z.object({
            apiKey: z.string().min(1).max(512),
            keyId: z.string().min(1).max(256),
          });
          const parsed = CredentialsSchema.safeParse({
            apiKey: callbackData?.apiKey,
            keyId: callbackData?.keyId,
          });
          if (!parsed.success) {
            throw new Error(
              "Invalid response from auth/callback: expected string apiKey and keyId within length limits."
            );
          }
          const credentials = {
            apiKey: parsed.data.apiKey,
            keyId: parsed.data.keyId,
            wallet: walletAddress,
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

          // The API key is deliberately NOT echoed here. Tool output goes straight into
          // an AI assistant's context, and from there into transcripts, logs and provider
          // retention — printing a live `bags_prod_*` secret there is a leak channel, not
          // a convenience. The key is already persisted to credentials.json above, so the
          // caller loses nothing: point them at the file instead of the value.
          const keyHint = typeof callbackData.apiKey === "string" && callbackData.apiKey.length > 4
            ? `…${callbackData.apiKey.slice(-4)}`
            : "(hidden)";
          return {
            content: [
              {
                type: "text",
                text: `✅ Successfully authenticated with Bags API.\nWallet: ${walletAddress}\nKey ID: ${callbackData.keyId}\nAPI Key: ${keyHint} — not printed in full${savePathMessage}\n\nRead the key from the credentials file above and set it as BAGS_API_KEY in your .env.`
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
