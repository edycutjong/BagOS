import "dotenv/config";
import * as tools from "./tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import { IMcpTool } from "./types/IMcpTool";
import cors from "cors";
import express from "express";
import { readFileSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };

const app = express();
const port = process.env["PORT"] || 3050;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    name: "BagOS MCP Server",
    version: pkg.version,
    tools: Object.keys(tools).filter((k) => k !== "__esModule"),
  });
});

// MCP endpoint — Prompt Opinion sends tool calls here
app.post("/mcp", async (req, res) => {
  try {
    const server = new McpServer(
      {
        name: "BagOS",
        version: pkg.version,
      },
      {
        capabilities: {
          experimental: {
            fhir_context_required: {
              value: true,
            },
          },
        },
      },
    );

    // Register all BagOS tools
    for (const tool of Object.values<IMcpTool>(tools)) {
      if (tool && typeof tool.registerTool === "function") {
        tool.registerTool(server, req);
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.listen(Number(port), "0.0.0.0", () => {
  console.log(`🛡️  BagOS MCP server listening on port ${port}`);
  console.log(`   Health: http://localhost:${port}/health`);
  console.log(`   MCP:    http://localhost:${port}/mcp`);
});
