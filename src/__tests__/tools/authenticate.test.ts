import { createMockServer } from "../helpers";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

jest.mock("../../lib/wallet", () => ({
  loadKeypair: () => ({
    publicKey: { toBase58: () => SYSTEM_PROGRAM },
    secretKey: new Uint8Array(64),
  }),
}));

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
    expect(result.content[0].text).toContain("test-api-key");
    expect(result.content[0].text).toContain("test-key-id");
    expect(result.isError).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
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

    const fs = require("fs");
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

    const fs = require("fs");
    const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});

    const { server, getHandler } = createMockServer();
    AuthenticateTool.registerTool(server);

    const result = await getHandler("bags_authenticate")({});
    
    expect(result.content[0].text).toContain("Credentials saved to");

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
    const fs = require("fs");
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
