import { McpUtilities } from "../lib/mcp-utils";

describe("BagOS Core utilities", () => {
  it("McpUtilities createTextResponse", () => {
    const res = McpUtilities.createTextResponse("hello");
    expect((res.content as any)[0].type).toBe("text");
    expect(res.isError).toBe(false);

    const err = McpUtilities.createTextResponse("error", { isError: true });
    expect(err.isError).toBe(true);
  });
});
