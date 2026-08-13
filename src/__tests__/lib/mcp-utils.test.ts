import { McpUtilities, redact, toolError } from "../../lib/mcp-utils.js";

/**
 * toolError is the only path errors take back to the model. It must never
 * carry a stack trace, and must never echo anything key-shaped.
 */

describe("redact", () => {
  it("removes a keypair byte array", () => {
    const leak = `bad file: [${Array.from({ length: 64 }, (_, i) => i).join(",")}]`;
    expect(redact(leak)).toContain("[REDACTED_KEYPAIR_BYTES]");
    expect(redact(leak)).not.toContain("17,18");
  });

  it("removes a long base58 string", () => {
    const b58 = "5".repeat(90);
    expect(redact(`key ${b58}`)).toContain("[REDACTED_BASE58]");
  });

  it("removes a long base64 blob", () => {
    const blob = "aB3+/".repeat(30);
    expect(redact(blob)).toMatch(/REDACTED/);
  });

  it("leaves ordinary messages and addresses alone", () => {
    const msg = "Insufficient funds for So11111111111111111111111111111111111111112";
    expect(redact(msg)).toBe(msg);
  });
});

describe("toolError", () => {
  it("flags the result as an error", () => {
    const result = toolError(new Error("boom"));
    expect(result.isError).toBe(true);
    expect(result.content[0]!.type).toBe("text");
  });

  it("includes the message but never the stack", () => {
    const err = new Error("something failed");
    const text = (toolError(err).content[0] as any).text;
    expect(text).toContain("something failed");
    expect(text).not.toContain("at Object");
    expect(text).not.toContain(err.stack!.split("\n")[1]!.trim());
  });

  it("prefixes a named error class", () => {
    class SpendCapError extends Error {
      constructor(m: string) { super(m); this.name = "SpendCapError"; }
    }
    const text = (toolError(new SpendCapError("over cap")).content[0] as any).text;
    expect(text).toContain("SpendCapError: over cap");
  });

  it("does not prefix a plain Error", () => {
    const text = (toolError(new Error("plain")).content[0] as any).text;
    expect(text).not.toContain("Error: plain");
    expect(text).toContain("plain");
  });

  it("accepts a bare string", () => {
    expect((toolError("just a string").content[0] as any).text).toContain("just a string");
  });

  it("handles a thrown non-Error without crashing", () => {
    const text = (toolError({ weird: true }).content[0] as any).text;
    expect(text).toContain("unknown error");
  });

  it("redacts key material inside an error message", () => {
    const leak = new Error(`parse failed near [${Array.from({ length: 64 }, () => 7).join(",")}]`);
    expect((toolError(leak).content[0] as any).text).toContain("[REDACTED_KEYPAIR_BYTES]");
  });
});

describe("McpUtilities.createTextResponse", () => {
  it("defaults to a non-error response", () => {
    expect(McpUtilities.createTextResponse("hi").isError).toBe(false);
  });

  it("marks errors when asked", () => {
    expect(McpUtilities.createTextResponse("bad", { isError: true }).isError).toBe(true);
  });
});
