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

describe("AuthenticateTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
        message: "3Wd1Fn", // base58-encoded payload
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
        message: "3Wd1Fn", // base58-encoded payload
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce-123" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce-123" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "nonce" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce" }),
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
      json: async () => ({ message: "3Wd1Fn", nonce: "test-nonce" }),
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
