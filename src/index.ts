#!/usr/bin/env node
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the working directory. The previous path was relative to the
// installed package, which for `npx bagos-mcp-server` resolves inside
// node_modules and is never where a user puts their config. Environment
// variables set by the MCP client always take precedence — dotenv does not
// overwrite existing vars.
dotenv.config();

import * as tools from "./tools/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IMcpTool } from "./types/IMcpTool.js";
import cors from "cors";
import express from "express";
import { readFileSync, realpathSync } from "fs";
import { reportPreflight } from "./lib/preflight.js";

const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string; name: string };

export async function startServer() {
  const isHttp = process.argv.includes("--http");
  const port = process.env["PORT"] || 3050;

  // Report configuration to stderr before opening the transport. stdout is the
  // JSON-RPC channel on stdio — writing anything there corrupts the stream.
  if (!reportPreflight()) {
    process.exit(1);
  }

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

/**
 * Last-resort handler for a startup failure. Named and exported rather than
 * inlined into `.catch()` so it can be tested: this is the path that turns a
 * thrown error into a non-zero exit code, and an MCP client sees nothing but
 * the exit code, so it has to be right.
 */
export function fatal(error: unknown): never {
  console.error("Fatal error starting server:", error);
  process.exit(1);
}

/**
 * Is this module the process entrypoint, rather than something an importer
 * pulled in?
 *
 * The realpath step is load-bearing, not defensive. `import.meta.url` is
 * resolved through symlinks by Node, but `process.argv[1]` is not — and the
 * two supported ways to run this server both arrive via a symlink:
 *
 *   - the `bin` shim: node_modules/.bin/bagos-mcp-server -> ../bagos-mcp-server/build/index.js
 *   - `npx bagos-mcp-server`, which goes through the same shim
 *
 * A naive `process.argv[1] === __filename` check is true for `node build/index.js`
 * and false for both of those, which would turn every installed copy of the
 * server into a process that starts, prints nothing, and exits 0.
 */
export function isEntrypoint(invokedPath: string | undefined): boolean {
  if (!invokedPath) return false;
  if (invokedPath === __filename) return true;
  try {
    return realpathSync(invokedPath) === __filename;
  } catch {
    // argv[1] names something unreadable. Not the entrypoint, and not worth
    // failing over — the alternative is crashing on import.
    return false;
  }
}

/**
 * Run the server, but only when this file IS the program.
 *
 * The previous version called `startServer()` unconditionally at module scope,
 * so merely importing this file booted a server and opened a transport. That
 * made index.ts untestable, which is why ~100 lines of it — including the
 * preflight gate and the entire HTTP mode — had no test at all.
 *
 * `node build/index.js`, `node build/index.js --http`, and the package `bin`
 * are unaffected: in all three, this file is the entrypoint, so the call still
 * happens at the same point in module evaluation with the same arguments.
 */
export function main(invokedPath: string | undefined = process.argv[1]): void {
  if (!isEntrypoint(invokedPath)) return;
  startServer().catch(fatal);
}

main();
