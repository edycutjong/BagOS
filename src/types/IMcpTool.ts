import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface IMcpTool {
  registerTool: (server: McpServer) => void;
}
