import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BagsClient } from "../lib/bags-client.js";
import { IMcpTool } from "../types/IMcpTool.js";
import { toolError } from "../lib/mcp-utils.js";

export const GetCreatorsTool: IMcpTool = {
  registerTool: (server: McpServer) => {
    server.tool(
      "bags_get_creators",
      "Query top creators by lifetime fees on Bags. Free read-only tier.",
      {
        limit: z.number().optional().describe("Amount of creators to return (default 10)"),
        offset: z.number().optional().describe("Pagination offset (default 0)")
      },
      async (args) => {
        try {
          const client = BagsClient.getBagsClient();
          
          const reqLimit = args.limit || 10;
          const reqOffset = args.offset || 0;

          const creators = await client.state.getTopTokensByLifetimeFees();

          return {
            content: [
              {
                type: "text",
                text: `Top ${reqLimit} Creators (Offset: ${reqOffset}):\n\n${JSON.stringify(creators, null, 2)}`
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
