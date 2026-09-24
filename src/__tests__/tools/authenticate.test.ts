import { createMockServer } from "../helpers.js";
import { jest } from "@jest/globals";
import fs from "fs";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

import { Wallet } from "../../lib/wallet.js";
jest.spyOn(Wallet, "loadKeypair").mockReturnValue({
  publicKey: { toBase58: () => SYSTEM_PROGRAM },
  secretKey: new Uint8Array(64),
} as any);

// Mock global fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { AuthenticateTool } from "../../tools/AuthenticateTool";
import { isTransactionMessage, bagsChallengeText } from "../../lib/challenge.js";

/** What Bags actually sends: its wallet-verification text, base58-encoded. */
const challenge = (nonce: string) => bs58.encode(new TextEncoder().encode(bagsChallengeText(nonce)));
import bs58 from "bs58";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
} from "@solana/web3.js";

const ATTACKER = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
const BLOCKHASH = "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CZ6YjUzgU6Nq";

/** A legacy transfer of 5 SOL from the tool's wallet to an attacker. */
function legacyTransferMessage(): Uint8Array {
  const tx = new Transaction({
    feePayer: new PublicKey(SYSTEM_PROGRAM),
    recentBlockhash: BLOCKHASH,
  }).add(
    SystemProgram.transfer({
      fromPubkey: Keypair.generate().publicKey,
      toPubkey: ATTACKER,
      lamports: 5_000_000_000,
    })
  );
  return tx.serializeMessage();
}

/** The same transfer as a v0 message. */
function v0TransferMessage(): Uint8Array {
  const payer = Keypair.generate().publicKey;
  return new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [
      SystemProgram.transfer({ fromPubkey: payer, toPubkey: ATTACKER, lamports: 5_000_000_000 }),
    ],
  }).compileToV0Message().serialize();
}

describe("AuthenticateTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  /* A2A-R01-01: the challenge bytes come from BAGS_API_URL. If they are a
     transaction message, an ed25519 signature over them IS a signed
     transaction, and the callback hands it to whoever runs that endpoint. */
  describe("refuses a challenge that is a transaction", () => {
    it.each([
      ["legacy", legacyTransferMessage],
      ["v0", v0TransferMessage],
    ])("refuses a %s transfer message and never calls back", async (_kind, build) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: bs58.encode(build()), nonce: "n" }),
      });
      const { server, getHandler } = createMockServer();
      AuthenticateTool.registerTool(server);

      const result = await getHandler("bags_authenticate")({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Refusing to sign");
      expect(mockFetch).toHaveBeenCalledTimes(1); // init only: no signature left the process
    });

    it("classifies text challenges as not a transaction", () => {
      const text = new TextEncoder().encode("Sign in to Bags. Nonce: 8f14e45fceea167a");
      expect(isTransactionMessage(text)).toBe(false);
      expect(isTransactionMessage(bs58.decode("3Wd1Fn"))).toBe(false);
      expect(isTransactionMessage(new Uint8Array())).toBe(false);
    });
  });

  it("refuses a non-Bags BAGS_API_URL before any request is made", async () => {
    process.env["BAGS_API_URL"] = "https://attacker.example";
    try {
      const { server, getHandler } = createMockServer();
      AuthenticateTool.registerTool(server);
      const result = await getHandler("bags_authenticate")({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be an https URL on bags.fm");
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      delete process.env["BAGS_API_URL"];
    }
  });

  it("refuses a binary challenge that is not a known transaction format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: bs58.encode(Keypair.generate().publicKey.toBytes()), nonce: "n" }),
    });
    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);
    const result = await getHandler("bags_authenticate")({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a plain-text sign-in message");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe("signs only the Bags challenge for this nonce", () => {
    async function run(message: string, nonce: unknown) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message, nonce }) });
      const { server, getHandler } = createMockServer();
      AuthenticateTool.registerTool(server);
      return getHandler("bags_authenticate")({});
    }
    const enc = (t: string) => bs58.encode(new TextEncoder().encode(t));

    it("refuses another service's sign-in text", async () => {
      const result = await run(enc("Sign in to OtherDex\n\nnonce: abc"), "abc");
      expect(result.content[0].text).toContain("does not match the Bags wallet-verification text");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("refuses the Bags text carrying a different nonce", async () => {
      const result = await run(challenge("other-nonce"), "this-nonce");
      expect(result.content[0].text).toContain("does not match");
    });

    it("refuses a nonce that could smuggle extra lines", async () => {
      const result = await run(enc(bagsChallengeText("a\nb")), "a\nb");
      expect(result.content[0].text).toContain("not a plain identifier");
    });

    it("refuses CRLF line endings rather than guessing", async () => {
      const result = await run(enc(bagsChallengeText("n1").replace(/\n/g, "\r\n")), "n1");
      expect(result.isError).toBe(true);
    });

    it("tolerates exactly one trailing newline", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: enc(bagsChallengeText("n2") + "\n"), nonce: "n2" }) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ apiKey: "k", keyId: "id" }) });
      const { server, getHandler } = createMockServer();
      AuthenticateTool.registerTool(server);
      const result = await getHandler("bags_authenticate")({});
      expect(result.isError).toBeUndefined();
    });
  });

  it("takes no keypair path from the caller", () => {
    const { server } = createMockServer();
    AuthenticateTool.registerTool(server);
    const schema = (server.tool as any).mock.calls[0][2];
    expect(Object.keys(schema)).toEqual([]);
  });

  it("registers the tool", () => {
    const { server } = createMockServer();
    AuthenticateTool.registerTool(server);
    expect(server.tool).toHaveBeenCalledWith(
      "bags_authenticate",
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("completes full auth flow on success", async () => {
    // Mock init response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: challenge("test-nonce-123"),
        nonce: "test-nonce-123",
      }),
    });

    // Mock callback response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        apiKey: "test-api-key",
        keyId: "test-key-id",
      }),
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    expect(result.content[0].text).toContain("Successfully authenticated");
    expect(result.content[0].text).toContain("test-key-id");
    expect(result.isError).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // Regression: the tool used to interpolate the live API key straight into its text
  // response. MCP tool output lands in the assistant's context and in transcripts, so a
  // real `bags_prod_*` secret was being published every time a user authenticated. The
  // key is written to credentials.json instead; only a 4-char tail is echoed.
  // This is a leak-channel test — treat a change here as a security change.
  it("never echoes the API key in the tool response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: challenge("test-nonce-123"),
        nonce: "test-nonce-123",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        apiKey: "bags_prod_SUPERSECRETVALUE",
        keyId: "test-key-id",
      }),
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const text = (await getHandler("bags_authenticate")({})).content[0].text;
    expect(text).not.toContain("bags_prod_SUPERSECRETVALUE");
    expect(text).not.toContain("SUPERSECRET");
    // the tail hint is allowed — it identifies the key without disclosing it
    expect(text).toContain("…ALUE");
    expect(text).toContain("not printed in full");
  });

  // A short-but-valid key still has to avoid disclosure: slicing a 4-char tail off a
  // 3-char secret would print most of it, so the hint degrades to a fixed literal.
  it("falls back to (hidden) on an apiKey too short to hint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce-123"), nonce: "test-nonce-123" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "abc", keyId: "test-key-id" }),
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const text = (await getHandler("bags_authenticate")({})).content[0].text;
    expect(text).toContain("(hidden)");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("abc");
  });

  // Regression for CodeQL js/http-to-file-access. The callback response used to be written
  // to credentials.json verbatim; a malformed or wrong-typed body reached the filesystem
  // unchecked. It is now validated first, and a bad response is an error rather than a
  // partial write. Treat a change here as a security change.
  it.each([
    ["a missing apiKey", { keyId: "test-key-id" }],
    ["a non-string apiKey", { apiKey: { nested: "object" }, keyId: "test-key-id" }],
    ["a missing keyId", { apiKey: "bags_prod_ABCDEFGH" }],
    ["an oversized apiKey", { apiKey: "x".repeat(513), keyId: "test-key-id" }],
  ])("rejects %s instead of writing it to disk", async (_label, body) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce-123"), nonce: "test-nonce-123" }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid response from auth/callback");
  });

  it("returns error when init fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Init auth failed");
    expect(result.content[0].text).toContain("401");
  });

  it("returns error when callback fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("nonce"), nonce: "nonce" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Invalid signature",
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Auth callback failed");
    expect(result.content[0].text).toContain("403");
  });

  // Leak channel: the upstream auth endpoint is the one that MINTS bags_prod_* keys,
  // and its raw response body used to be interpolated verbatim into the thrown Error,
  // whose .message was then printed straight to the model. The body is now redacted at
  // the point of interpolation. This is a leak-channel test — treat a change here as a
  // security change.
  it("redacts key material in an upstream error body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => `rejected key bags_prod_SUPERSECRETVALUE and seed ${"5".repeat(88)}`,
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const text = (await getHandler("bags_authenticate")({})).content[0].text;
    expect(text).not.toContain("SUPERSECRETVALUE");
    expect(text).not.toContain("5".repeat(88));
    expect(text).toContain("[REDACTED_API_KEY]");
    expect(text).toContain("[REDACTED_BASE58]");
    // the useful part still survives
    expect(text).toContain("Init auth failed");
    expect(text).toContain("400");
  });

  // An upstream that returns a huge body should not be able to flood the model's
  // context through an error path either.
  it("bounds the length of an upstream error body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce-123"), nonce: "test-nonce-123" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "upstream exploded. ".repeat(200),
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const text = (await getHandler("bags_authenticate")({})).content[0].text;
    expect(text).toContain("Auth callback failed");
    expect(text).toMatch(/truncated, \d+ chars/);
    expect(text.length).toBeLessThan(400);
  });

  it("returns error when init response missing nonce", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "3Wd1Fn" }),
    });

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("expected message and nonce");
  });

  it("handles fs.writeFileSync error gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce"), nonce: "test-nonce" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "test-api-key", keyId: "test-key-id" }),
    });

    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {
        throw new Error("EACCES");
    });
    const logSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    
    expect(result.isError).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith("Could not save credentials", expect.any(Error));

    existsSpy.mockRestore();
    writeSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("handles fs.writeFileSync success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce"), nonce: "test-nonce" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "test-api-key", keyId: "test-key-id" }),
    });

    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    
    expect(result.content[0].text).toContain("Credentials saved to");

    existsSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("handles fs.existsSync false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce"), nonce: "test-nonce" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "test-api-key", keyId: "test-key-id" }),
    });

    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(false);
    const writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    
    expect(result.content[0].text).not.toContain("Credentials saved to");

    existsSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("handles HOME environment variable fallback", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: challenge("test-nonce"), nonce: "test-nonce" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiKey: "test-key", keyId: "test-id" }),
    });

    const originalHome = process.env.HOME;
    delete process.env.HOME;
    
    // We expect it to save to /credentials.json or something
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);
    await getHandler("bags_authenticate")({});

    process.env.HOME = originalHome;
    existsSpy.mockRestore();
    writeSpy.mockRestore();
  });
});
