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

  // The shape from the original incident. The length-based rules miss it: a Bags
  // key is neither base58 nor base64 (it has underscores) and is far under 80
  // chars, so before this pattern existed a `bags_prod_*` key passed through
  // redact() untouched.
  it("removes a bags API key, which no length-based rule catches", () => {
    const text = redact("upstream said: key bags_prod_SUPERSECRETVALUE is revoked");
    expect(text).not.toContain("SUPERSECRETVALUE");
    expect(text).toContain("[REDACTED_API_KEY]");
  });

  // Regression: the first version of the API-key rule was
  // /\bbags_[a-z]+_[A-Za-z0-9]{8,}/ , which matches this server's own tool name
  // `bags_get_claimable_fees` ("claimable" is 9 chars) and rewrote it to
  // "[REDACTED_API_KEY]_fees" in any error message that mentioned it. A redactor
  // that corrupts ordinary text gets switched off, so this case is load-bearing.
  it("leaves tool names alone, including the one that collides with the key shape", () => {
    for (const name of [
      "bags_get_claimable_fees",
      "bags_get_partner_stats",
      "bags_get_token_claim_events",
      "bags_resolve_launch_wallet",
      "bags_execute_trade",
    ]) {
      const msg = `Failed calling ${name} for wallet`;
      expect(redact(msg)).toBe(msg);
    }
  });

  it("still catches a key whose prefix looks like a tool verb", () => {
    expect(redact("bags_get_A1b2C3d4E5")).toContain("[REDACTED_API_KEY]");
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

  it("reports a signature carried on the error object, after redaction", () => {
    const sig = "5".repeat(88);
    const err = Object.assign(new Error("Transaction failed on chain."), { signature: sig });
    const text = (toolError(err).content[0] as any).text;
    expect(text).toContain(`Signature: ${sig}`);
    expect(text).toContain("explorer.solana.com");
  });

  it("does NOT exempt an explorer URL inside the message — that was a smuggling channel", () => {
    // A base58 secret key and a signature are the same shape, so exempting
    // explorer URLs let key material survive simply by being prefixed with one.
    const secret = "5".repeat(88);
    const err = new Error(`sdk error: https://explorer.solana.com/tx/${secret}`);
    const text = (toolError(err).content[0] as any).text;
    expect(text).not.toContain(secret);
    expect(text).toContain("[REDACTED_BASE58]");
  });

  it("does not emit 'undefined' for a literal placeholder in the message", () => {
    const text = (toolError(new Error("see EXPLORER0 for details")).content[0] as any).text;
    expect(text).not.toContain("undefined");
    expect(text).toContain("EXPLORER0");
  });

  it("still redacts a bare base58 blob that is not an explorer link", () => {
    const text = (toolError(new Error(`key ${"5".repeat(88)} leaked`)).content[0] as any).text;
    expect(text).toContain("[REDACTED_BASE58]");
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
