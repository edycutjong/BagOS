import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { jest } from "@jest/globals";
import { preflight, reportPreflight } from "../../lib/preflight.js";
import { resetConnection } from "../../lib/network.js";

/**
 * preflight() is the gate that decides whether the server boots at all, and
 * until now nothing imported it from a test — so it was not merely untested,
 * it was invisible: without collectCoverageFrom, Jest left it out of the
 * denominator and the suite still reported "100%".
 *
 * Two things are asserted throughout, beyond branch coverage:
 *   1. every line goes to STDERR. stdout is the JSON-RPC channel on the stdio
 *      transport, so one stray console.log corrupts the protocol and the
 *      client reports an opaque parse failure.
 *   2. a [FAIL] is fatal. `ok` is what index.ts turns into `process.exit(1)`.
 */

const saved = { ...process.env };

/**
 * Every variable preflight reads, cleared before each test. The repo has a
 * real .env with live credentials; nothing here may inherit from it or from
 * the developer's shell, or these assertions would pass or fail by accident.
 */
const READ_VARS = [
  "BAGS_API_KEY",
  "BAGS_NETWORK",
  "SOLANA_RPC_URL",
  "HELIUS_RPC_URL",
  "BAGS_KEYPAIR_PATH",
  "BOS_TOKEN_MINT",
  "BOS_REQUIRED_BALANCE",
  "BAGS_MAX_SOL_PER_TX",
  "BAGS_MAX_SOL_PER_SESSION",
  "BAGS_ALLOW_UNCONFIRMED",
  "USE_MOCK_DATA",
];

beforeEach(() => {
  for (const key of READ_VARS) delete process.env[key];
  resetConnection();
});

afterAll(() => {
  process.env = saved;
});

/** The one line matching a label, minus the alignment padding. */
function line(lines: string[], label: string): string {
  const found = lines.find((l) => l.includes(label));
  if (!found) throw new Error(`No preflight line for "${label}":\n${lines.join("\n")}`);
  return found.replace(/\s+/g, " ").trim();
}

describe("preflight — BAGS_API_KEY", () => {
  // Deliberately NOT fatal. A missing key makes the server useless, not
  // dangerous, and only the second justifies refusing to start: aborting here
  // meant no client could list the tools before being configured, which is the
  // order MCP clients actually work in. It also left Smithery indexing the
  // server with zero tools. The two genuinely dangerous misconfigurations —
  // a cluster/RPC mismatch and an unparseable spend cap — stay fatal, and the
  // tests below hold that line.
  it("warns but still starts when missing, so tools stay discoverable", () => {
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_API_KEY")).toContain("[WARN]");
    expect(line(lines, "BAGS_API_KEY")).toContain("dev.bags.fm");
    expect(ok).toBe(true);
  });

  it("passes when set, and never echoes the value", () => {
    process.env["BAGS_API_KEY"] = "bags_prod_SUPERSECRET";
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_API_KEY")).toContain("[ok]");
    expect(lines.join("\n")).not.toContain("SUPERSECRET");
    expect(ok).toBe(true);
  });
});

describe("preflight — cluster", () => {
  it("reports devnet as the default and does not warn", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_NETWORK")).toBe("[ok] BAGS_NETWORK devnet (default)");
    expect(ok).toBe(true);
  });

  it("warns on mainnet, where writes move real funds", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_NETWORK"] = "mainnet";
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_NETWORK")).toContain("[WARN]");
    expect(line(lines, "BAGS_NETWORK")).toContain("REAL funds");
    // A warning, not a failure — mainnet is a supported configuration.
    expect(ok).toBe(true);
  });

  it("reports the RPC endpoint with credentials stripped", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["SOLANA_RPC_URL"] = "https://api.devnet.solana.com/?api-key=SECRET123";
    const { lines } = preflight();
    expect(line(lines, "RPC")).toContain("REDACTED");
    expect(lines.join("\n")).not.toContain("SECRET123");
  });

  it("is fatal when getNetwork() throws on an unrecognised cluster", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_NETWORK"] = "testnet";
    const { ok, lines } = preflight();
    expect(line(lines, "network")).toContain("[FAIL]");
    expect(line(lines, "network")).toContain('BAGS_NETWORK must be');
    expect(ok).toBe(false);
  });

  it("is fatal when the RPC endpoint contradicts the declared network", () => {
    // Regression guard: this pairing used to sign against mainnet under a
    // "devnet" banner. Preflight must refuse to start, not print both.
    process.env["BAGS_API_KEY"] = "k";
    process.env["HELIUS_RPC_URL"] = "https://mainnet.helius-rpc.com/?api-key=abc";
    const { ok, lines } = preflight();
    expect(line(lines, "network")).toContain("Network mismatch");
    expect(ok).toBe(false);
  });
});

describe("preflight — BAGS_KEYPAIR_PATH", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bagos-preflight-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is informational when unset — read-only tools still work", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("[--]");
    expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("read-only");
    expect(ok).toBe(true);
  });

  it("passes on an absolute path that exists", () => {
    const keyfile = path.join(tmpDir, "keypair.json");
    fs.writeFileSync(keyfile, "[]");
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_KEYPAIR_PATH"] = keyfile;
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("[ok]");
    expect(ok).toBe(true);
  });

  it("warns — but does not abort — when the path is missing", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_KEYPAIR_PATH"] = path.join(tmpDir, "does-not-exist.json");
    const { ok, lines } = preflight();
    expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("[WARN]");
    expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("write tools will fail");
    // Read-only tools are still usable, so this must not be fatal.
    expect(ok).toBe(true);
  });

  it("expands a leading ~/ against HOME", () => {
    // The default keypair location is documented as ~/.config/bags/keypair.json,
    // so a literal "~" would have made preflight report every default install
    // as broken.
    const nested = path.join(tmpDir, "home");
    fs.mkdirSync(path.join(nested, ".config", "bags"), { recursive: true });
    fs.writeFileSync(path.join(nested, ".config", "bags", "keypair.json"), "[]");
    process.env["BAGS_API_KEY"] = "k";
    process.env["HOME"] = nested;
    process.env["BAGS_KEYPAIR_PATH"] = "~/.config/bags/keypair.json";
    try {
      expect(line(preflight().lines, "BAGS_KEYPAIR_PATH")).toContain("[ok]");
    } finally {
      process.env["HOME"] = saved["HOME"] as string;
    }
  });

  it("falls back to USERPROFILE when HOME is unset (Windows)", () => {
    const nested = path.join(tmpDir, "userprofile");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "kp.json"), "[]");
    process.env["BAGS_API_KEY"] = "k";
    delete process.env["HOME"];
    process.env["USERPROFILE"] = nested;
    process.env["BAGS_KEYPAIR_PATH"] = "~/kp.json";
    try {
      expect(line(preflight().lines, "BAGS_KEYPAIR_PATH")).toContain("[ok]");
    } finally {
      process.env["HOME"] = saved["HOME"] as string;
      delete process.env["USERPROFILE"];
    }
  });

  it("warns rather than throwing when neither HOME nor USERPROFILE is set", () => {
    process.env["BAGS_API_KEY"] = "k";
    delete process.env["HOME"];
    delete process.env["USERPROFILE"];
    process.env["BAGS_KEYPAIR_PATH"] = "~/kp.json";
    try {
      const { ok, lines } = preflight();
      expect(line(lines, "BAGS_KEYPAIR_PATH")).toContain("[WARN]");
      expect(ok).toBe(true);
    } finally {
      process.env["HOME"] = saved["HOME"] as string;
    }
  });
});

describe("preflight — BOS_TOKEN_MINT", () => {
  it("passes when set", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BOS_TOKEN_MINT"] = "EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS";
    expect(line(preflight().lines, "BOS_TOKEN_MINT")).toContain("[ok]");
  });

  it("warns when unset, because the write gate will reject every call", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { ok, lines } = preflight();
    expect(line(lines, "BOS_TOKEN_MINT")).toContain("[WARN]");
    expect(line(lines, "BOS_TOKEN_MINT")).toContain("gate check");
    expect(ok).toBe(true);
  });
});

describe("preflight — spend caps", () => {
  it("prints both caps at their defaults", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { ok, lines } = preflight();
    expect(line(lines, "spend caps")).toBe("[ok] spend caps 0.1 SOL/tx · 1 SOL/session");
    expect(ok).toBe(true);
  });

  it("prints overridden caps", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_MAX_SOL_PER_TX"] = "0.5";
    process.env["BAGS_MAX_SOL_PER_SESSION"] = "2";
    expect(line(preflight().lines, "spend caps")).toContain("0.5 SOL/tx");
  });

  it("is fatal when a cap is unparseable rather than booting uncapped", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_MAX_SOL_PER_TX"] = "not-a-number";
    const { ok, lines } = preflight();
    expect(line(lines, "spend caps")).toContain("[FAIL]");
    expect(line(lines, "spend caps")).toContain("non-negative number");
    expect(ok).toBe(false);
  });

  it("is fatal on a negative cap", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_MAX_SOL_PER_SESSION"] = "-1";
    expect(preflight().ok).toBe(false);
  });
});

describe("preflight — confirmation", () => {
  it("reports confirmation required by default", () => {
    process.env["BAGS_API_KEY"] = "k";
    expect(line(preflight().lines, "confirmation")).toBe(
      "[ok] confirmation required on all writes"
    );
  });

  it("warns loudly when BAGS_ALLOW_UNCONFIRMED disables it", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BAGS_ALLOW_UNCONFIRMED"] = "true";
    const { ok, lines } = preflight();
    expect(line(lines, "confirmation")).toContain("[WARN]");
    expect(line(lines, "confirmation")).toContain("DISABLED");
    // Opting out of confirmations is allowed; it just has to be visible.
    expect(ok).toBe(true);
  });
});

describe("preflight — USE_MOCK_DATA", () => {
  /**
   * This flag is the only one that changes what a tool RETURNS rather than
   * what it is permitted to do: it makes bags_get_claimable_fees invent
   * balances. It was the one configuration flag preflight did not mention.
   */
  it("reports off by default", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { ok, lines } = preflight();
    expect(line(lines, "USE_MOCK_DATA")).toBe("[ok] USE_MOCK_DATA off — tools report real data");
    expect(ok).toBe(true);
  });

  it("warns when on, and says the balances are fabricated", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["USE_MOCK_DATA"] = "true";
    const { ok, lines } = preflight();
    expect(line(lines, "USE_MOCK_DATA")).toContain("[WARN]");
    expect(line(lines, "USE_MOCK_DATA")).toContain("FABRICATED");
    expect(line(lines, "USE_MOCK_DATA")).toContain("bags_get_claimable_fees");
    // A mock left on is a misconfiguration to shout about, not a boot failure.
    expect(ok).toBe(true);
  });

  it("reports off for a value the tool itself would ignore", () => {
    // GetClaimableFees tests `=== 'true'`. Anything else leaves mock data OFF,
    // and preflight must agree with the tool rather than with intent.
    process.env["BAGS_API_KEY"] = "k";
    process.env["USE_MOCK_DATA"] = "1";
    expect(line(preflight().lines, "USE_MOCK_DATA")).toContain("[ok]");
  });
});

describe("preflight — report shape", () => {
  it("leads with a header and reports every flag on one run", () => {
    process.env["BAGS_API_KEY"] = "k";
    const { lines } = preflight();
    expect(lines[0]).toBe("BagOS MCP server — configuration");
    for (const label of [
      "BAGS_API_KEY",
      "BAGS_NETWORK",
      "RPC",
      "BAGS_KEYPAIR_PATH",
      "BOS_TOKEN_MINT",
      "spend caps",
      "confirmation",
      "USE_MOCK_DATA",
    ]) {
      expect(() => line(lines, label)).not.toThrow();
    }
  });

  it("collects every failure in one pass instead of stopping at the first", () => {
    process.env["BAGS_NETWORK"] = "testnet";
    process.env["BAGS_MAX_SOL_PER_TX"] = "abc";
    const { ok, lines } = preflight();
    // Two, not three: a missing BAGS_API_KEY is a [WARN] now, so the only
    // fatals left are the two that can misdirect real money.
    expect(lines.filter((l) => l.includes("[FAIL]"))).toHaveLength(2);
    expect(ok).toBe(false);
  });
});

describe("reportPreflight", () => {
  let errSpy: ReturnType<typeof jest.spyOn>;
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("writes every line to stderr and NOTHING to stdout", () => {
    // stdout is the JSON-RPC stream on the stdio transport. A single stray
    // console.log here corrupts the protocol and the client reports an opaque
    // parse failure, so this assertion is the point of the whole function.
    process.env["BAGS_API_KEY"] = "k";
    const ok = reportPreflight();
    expect(ok).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy.mock.calls.length).toBe(preflight().lines.length);
    expect(errSpy).toHaveBeenCalledWith("BagOS MCP server — configuration");
  });

  it("returns false and explains how to recover when a check is fatal", () => {
    // An unparseable spend cap, because a missing API key no longer aborts.
    process.env["BAGS_MAX_SOL_PER_TX"] = "abc";
    const ok = reportPreflight();
    expect(ok).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith("Server not started: fix the [FAIL] items above.");
  });

  it("does not print the recovery footer on a clean run", () => {
    process.env["BAGS_API_KEY"] = "k";
    reportPreflight();
    const printed = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).not.toContain("Server not started");
  });
});

describe("preflight — BOS_REQUIRED_BALANCE", () => {
  it("is fatal when unparseable, so a typo is caught at startup not at first write", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BOS_REQUIRED_BALANCE"] = "abc";
    const { ok, lines } = preflight();
    expect(line(lines, "BOS_REQUIRED_BALANCE")).toContain("[FAIL]");
    expect(ok).toBe(false);
  });

  it("warns rather than fails when set to 0, because 0 is a real choice", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BOS_REQUIRED_BALANCE"] = "0";
    const { ok, lines } = preflight();
    expect(line(lines, "BOS_REQUIRED_BALANCE")).toContain("[WARN]");
    expect(line(lines, "BOS_REQUIRED_BALANCE")).toContain("token gate disabled");
    expect(ok).toBe(true);
  });

  it("reports the value when set to a normal number", () => {
    process.env["BAGS_API_KEY"] = "k";
    process.env["BOS_REQUIRED_BALANCE"] = "500";
    const { lines } = preflight();
    expect(line(lines, "BOS_REQUIRED_BALANCE")).toContain("[ok]");
    expect(line(lines, "BOS_REQUIRED_BALANCE")).toContain("500");
  });
});
