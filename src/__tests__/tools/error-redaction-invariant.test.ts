import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * WHAT THIS PROTECTS
 *
 * Every tool's failure path must reach the model through `toolError()` in
 * src/lib/mcp-utils.ts, which is the only place redaction happens. Tool output
 * is copied verbatim into an assistant's context, and from there into
 * transcripts, logs and provider retention — a raw `error.message` published
 * there is a disclosure, not a debug aid. That is not hypothetical: a live
 * `bags_prod_*` API key was once echoed straight out of this server's tool
 * output, which is why `redact()` and `toolError()` exist at all (see the
 * comments in mcp-utils.ts and the regression test in authenticate.test.ts).
 *
 * The control originally covered only the tools written during the hardening
 * pass. The other seven — every tool that predated it — still built their own
 * `Failed to ...: ${error.message}` strings, so half the tool surface bypassed
 * redaction entirely, and nothing failed when it did. This test is that missing
 * "nothing": it is a SOURCE-level assertion over src/tools/*.ts, so a NEW tool
 * that hand-rolls an error string fails here even if its own unit tests are
 * green and even if the leaky branch is never executed.
 *
 * If you are here because this test went red: do not relax the rule. Route the
 * catch through `toolError(error)`. If you genuinely need extra context in the
 * message, wrap the error before rethrowing — never assemble tool output from a
 * raw message. Treat any change to this file as a security change.
 */

const TOOLS_DIR = path.resolve(fileURLToPath(import.meta.url), "../../../tools");

/** Every tool module. index.ts is a barrel — it registers, it never catches. */
const TOOL_FILES = fs
  .readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .sort();

/** Read a tool's source. */
const sourceOf = (file: string) => fs.readFileSync(path.join(TOOLS_DIR, file), "utf8");

/**
 * Every `catch (...) { ... }` body in a source file, brace-matched so nested
 * blocks come back whole rather than being cut at the first `}`.
 */
function catchBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /\bcatch\s*\([^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    blocks.push(src.slice(start, i - 1));
  }
  return blocks;
}

describe("tool error-path invariant (leak channel)", () => {
  it("finds the tool sources it is supposed to be guarding", () => {
    // A glob that silently matches nothing would make every assertion below
    // vacuously pass — the failure mode this whole file exists to prevent.
    expect(TOOL_FILES.length).toBeGreaterThanOrEqual(14);
    expect(TOOL_FILES).toContain("AuthenticateTool.ts");
  });

  it.each(TOOL_FILES)("%s imports toolError from the redaction helper", (file) => {
    expect(sourceOf(file)).toMatch(
      /import\s*\{[^}]*\btoolError\b[^}]*\}\s*from\s*["']\.\.\/lib\/mcp-utils\.js["']/
    );
  });

  it.each(TOOL_FILES)("%s types its catch clauses as unknown, never any", (file) => {
    // `catch (error: any)` is how `error.message` became reachable without a
    // type error in the first place. toolError already accepts unknown.
    expect(sourceOf(file)).not.toMatch(/\bcatch\s*\([^)]*:\s*any\s*\)/);
  });

  it.each(TOOL_FILES)("%s never builds tool output inside a catch by hand", (file) => {
    for (const block of catchBlocks(sourceOf(file))) {
      // A catch that returns MCP content (`content: [...]`) must have gone
      // through toolError. A catch that only logs is fine — it never reaches
      // the model.
      if (/\bcontent\s*:/.test(block)) {
        expect(block).toContain("toolError(");
      }
    }
  });

  it.each(TOOL_FILES)("%s never interpolates a raw error message", (file) => {
    // Deliberately matches the thrown-value identifiers this codebase uses, not
    // every `.message` — AuthenticateTool legitimately reads `initData.message`,
    // the base58 challenge payload from the auth endpoint.
    const RAW_ERROR_MESSAGE = /\b(?:error|err|e|cause)\s*\??\.\s*message\b/;
    const offenders = sourceOf(file)
      .split("\n")
      .filter((line) => RAW_ERROR_MESSAGE.test(line))
      // The one legal way to touch a message directly is to redact it on the
      // spot — ClaimFees reports a mid-batch transaction failure that way.
      .filter((line) => !line.includes("redact("));
    expect(offenders).toEqual([]);
  });
});
