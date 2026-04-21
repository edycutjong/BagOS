import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const McpUtilities = {
  createTextResponse: (
    text: string,
    options: { isError: boolean } = { isError: false },
  ): CallToolResult => {
    return {
      content: [{ type: "text", text }],
      isError: options.isError,
    };
  },
};
