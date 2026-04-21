#!/usr/bin/env node
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

import * as tools from "./tools/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IMcpTool } from "./types/IMcpTool.js";
import cors from "cors";
import express from "express";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string; name: string };

async function startServer() {
  const isHttp = process.argv.includes("--http");
  const port = process.env["PORT"] || 3050;

  const server = new McpServer(
    {
      name: "BagOS",
      version: pkg.version,
    }
  );

  // Register all BagOS tools
  for (const tool of Object.values<IMcpTool>(tools)) {
    if (tool && typeof tool.registerTool === "function") {
      tool.registerTool(server);
    }
  }

  if (isHttp) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get("/health", async (_req, res) => {
      res.json({
        status: "ok",
        name: pkg.name,
        version: pkg.version,
        tools: Object.keys(tools).filter((k) => k !== "__esModule"),
      });
    });

    app.post("/mcp", async (req, res) => {
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        res.on("close", () => {
          transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error in MCP HTTP endpoint:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    });

    app.listen(Number(port), "0.0.0.0", () => {
      console.log(`🛡️  BagOS MCP HTTP server listening on port ${port}`);
    });
  } else {
    // Default: Stdio transport for Claude Desktop
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

startServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
