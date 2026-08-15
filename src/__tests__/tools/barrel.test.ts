import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as tools from "../../tools/index.js";

/**
 * The barrel is what index.ts iterates to register tools, and what /health
 * advertises. index.test.ts mocks it — deliberately, so the registration
 * guard's reject-a-non-tool branch is reachable — which means nothing there
 * would notice a tool file that exists but was never wired in. That is the
 * failure this file exists to catch: the tool would be fully unit-tested,
 * fully covered, and completely absent from the running server.
 *
 * Both assertions are derived from the directory rather than hardcoded, so
 * adding or renaming a tool does not require editing a list here.
 */

const TOOLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tools");

describe("tools barrel", () => {
  it("re-exports one tool per tool module on disk", () => {
    const modules = fs
      .readdirSync(TOOLS_DIR)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .sort();

    expect(modules.length).toBeGreaterThan(0);
    expect(Object.keys(tools)).toHaveLength(modules.length);
  });

  it("exports nothing that index.ts would refuse to register", () => {
    // index.ts skips anything without a registerTool function rather than
    // crashing, so a broken export would be silently dropped at startup.
    for (const [name, exported] of Object.entries(tools)) {
      expect({ name, ok: typeof (exported as any)?.registerTool === "function" }).toEqual({
        name,
        ok: true,
      });
    }
  });
});
