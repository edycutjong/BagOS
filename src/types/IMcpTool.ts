import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

export interface IMcpTool {
  registerTool: (server: McpServer) => void;
}
