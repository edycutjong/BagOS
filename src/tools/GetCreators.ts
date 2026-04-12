import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { getBagsClient } from "../lib/bags-client";
import { IMcpTool } from "../types/IMcpTool";

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
          const client = getBagsClient();
          
          const reqLimit = args.limit || 10;
          const reqOffset = args.offset || 0;

          // Replace with exact SDK method when typed out:
          const creators = await client.state.getCreators?.(reqLimit, reqOffset) || [];

          return {
            content: [
              {
                type: "text",
                text: `Top ${reqLimit} Creators (Offset: ${reqOffset}):\n\n${JSON.stringify(creators, null, 2)}`
              }
            ]
          };
        } catch (error: any) {
          return {
            content: [
              { type: "text", text: `Failed to fetch creators: ${error.message}` }
            ],
            isError: true,
          };
        }
      }
    );
  }
};
