import { McpUtilities } from "../../lib/mcp-utilities";

describe("McpUtilities", () => {
  describe("createTextResponse", () => {
    it("creates a success response with text content", () => {
      const result = McpUtilities.createTextResponse("Hello world");
      expect(result).toEqual({
        content: [{ type: "text", text: "Hello world" }],
        isError: false,
      });
    });

    it("creates an error response when isError is true", () => {
      const result = McpUtilities.createTextResponse("Something failed", {
        isError: true,
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "Something failed" }],
        isError: true,
      });
    });

    it("defaults isError to false when no options provided", () => {
      const result = McpUtilities.createTextResponse("Test");
      expect(result.isError).toBe(false);
    });
  });
});
