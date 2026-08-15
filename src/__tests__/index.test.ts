import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { jest } from "@jest/globals";

/**
 * Tests for the server entrypoint.
 *
 * index.ts used to call startServer() at module scope, so importing it booted
 * a server and opened a transport — untestable by construction. It was also
 * absent from the coverage report entirely, because Jest only instruments what
 * a test imports; nothing imported it, so ~100 lines including the preflight
 * gate and all of HTTP mode were missing from the denominator rather than
 * showing as 0%.
 *
 * Everything external is mocked. This suite must never open a port, a socket,
 * or read the developer's real .env — hence the dotenv mock.
 */

const INDEX_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.ts");

/* ------------------------------------------------------------------ */
/* Mocks — all registered before the module under test is imported     */
/* ------------------------------------------------------------------ */

const dotenvConfig = jest.fn();
jest.unstable_mockModule("dotenv", () => ({ default: { config: dotenvConfig } }));

// The repo has a real .env with live credentials. Mocking dotenv keeps it out
// of process.env for this suite: tests must never pass or fail because of what
// a developer happens to have configured locally.

const corsMiddleware = { __mw: "cors" };
const corsFactory = jest.fn(() => corsMiddleware);
jest.unstable_mockModule("cors", () => ({ default: corsFactory }));

const jsonMiddleware = { __mw: "json" };
const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn((_port: number, _host: string, cb: () => void) => cb()),
};
const expressFactory = Object.assign(
  jest.fn(() => mockApp),
  { json: jest.fn(() => jsonMiddleware) }
);
jest.unstable_mockModule("express", () => ({ default: expressFactory }));

const serverConnect = jest.fn<any>();
class MockMcpServer {
  static instances: MockMcpServer[] = [];
  connect = serverConnect;
  constructor(public info: { name: string; version: string }) {
    MockMcpServer.instances.push(this);
  }
}
jest.unstable_mockModule("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: MockMcpServer,
}));

class MockStdioTransport {
  static instances: MockStdioTransport[] = [];
  constructor() {
    MockStdioTransport.instances.push(this);
  }
}
jest.unstable_mockModule("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: MockStdioTransport,
}));

const transportClose = jest.fn();
const transportHandleRequest = jest.fn<any>();
class MockHttpTransport {
  static instances: MockHttpTransport[] = [];
  close = transportClose;
  handleRequest = transportHandleRequest;
  constructor(public opts: unknown) {
    MockHttpTransport.instances.push(this);
  }
}
jest.unstable_mockModule("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: MockHttpTransport,
}));

/**
 * A deliberately mixed tool barrel. The registration loop guards with
 * `tool && typeof tool.registerTool === "function"`, and the real barrel
 * exports nothing but tools — so the guard's false side is only reachable with
 * a stand-in. `index-tools-barrel.test.ts` covers the real barrel's shape.
 */
const registerAlpha = jest.fn();
const registerBeta = jest.fn();
jest.unstable_mockModule("../tools/index.js", () => ({
  AlphaTool: { registerTool: registerAlpha },
  BetaTool: { registerTool: registerBeta },
  NOT_A_TOOL: "just a constant",
  MissingTool: null,
}));

const reportPreflight = jest.fn<() => boolean>();
jest.unstable_mockModule("../lib/preflight.js", () => ({ reportPreflight }));

const { startServer, main, fatal, isEntrypoint } = await import("../index.js");

/**
 * Import-time side effects, captured before the per-test clearAllMocks() wipes
 * the record. dotenv.config() runs once when the module is evaluated, so it
 * cannot be observed from inside a test.
 */
const dotenvConfigCallsAtImport = dotenvConfig.mock.calls.length;

/** The package.json index.ts stamps onto the server and /health. */
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(INDEX_PATH), "../package.json"), "utf-8")
) as { name: string; version: string };

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

const savedArgv = process.argv;
const savedPort = process.env["PORT"];

let exitSpy: ReturnType<typeof jest.spyOn>;
let errSpy: ReturnType<typeof jest.spyOn>;
let logSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  jest.clearAllMocks();
  MockMcpServer.instances = [];
  MockStdioTransport.instances = [];
  MockHttpTransport.instances = [];

  reportPreflight.mockReturnValue(true);
  serverConnect.mockResolvedValue(undefined);
  transportHandleRequest.mockResolvedValue(undefined);
  mockApp.listen.mockImplementation((_port: number, _host: string, cb: () => void) => cb());
  expressFactory.mockReturnValue(mockApp);

  process.argv = ["node", "/somewhere/build/index.js"];
  delete process.env["PORT"];

  // process.exit never returns. Throwing preserves that control flow, so a
  // test cannot accidentally assert on code that the real process would never
  // have reached.
  exitSpy = jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  errSpy.mockRestore();
  logSpy.mockRestore();
});

afterAll(() => {
  process.argv = savedArgv;
  if (savedPort === undefined) delete process.env["PORT"];
  else process.env["PORT"] = savedPort;
});

/** The handler registered for an express route. */
function routeHandler(spy: typeof mockApp.get, route: string): (req: any, res: any) => Promise<void> {
  const call = spy.mock.calls.find((c) => c[0] === route);
  if (!call) throw new Error(`No handler registered for ${route}`);
  return call[1] as (req: any, res: any) => Promise<void>;
}

/** A response double that records what the handler did to it. */
function fakeRes(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, () => void> = {};
  return {
    headersSent: false,
    json: jest.fn(),
    status: jest.fn(function (this: any) {
      return this;
    }),
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    fire: (event: string) => listeners[event]?.(),
    ...overrides,
  } as any;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("module initialisation", () => {
  it("loads .env from the working directory", () => {
    // Regression: the path used to be relative to the installed package, which
    // for `npx bagos-mcp-server` resolves inside node_modules and is never
    // where a user puts their config.
    expect(dotenvConfigCallsAtImport).toBe(1);
  });
});

describe("startServer — preflight gate", () => {
  it("exits 1 without constructing a server when preflight fails", async () => {
    reportPreflight.mockReturnValue(false);
    await expect(startServer()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    // The point of the gate: nothing is constructed and no transport opens.
    expect(MockMcpServer.instances).toHaveLength(0);
    expect(MockStdioTransport.instances).toHaveLength(0);
  });

  it("runs preflight before any transport is opened", async () => {
    await startServer();
    expect(reportPreflight).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("startServer — tool registration", () => {
  it("registers every export that is a tool", async () => {
    await startServer();
    expect(registerAlpha).toHaveBeenCalledTimes(1);
    expect(registerBeta).toHaveBeenCalledTimes(1);
    expect(registerAlpha).toHaveBeenCalledWith(MockMcpServer.instances[0]);
  });

  it("skips exports that are not tools instead of throwing", async () => {
    // A barrel that grows a constant or a null export must not take the
    // server down on startup.
    await expect(startServer()).resolves.toBeUndefined();
  });

  it("names the server and stamps it with the package version", async () => {
    await startServer();
    expect(MockMcpServer.instances[0]?.info).toEqual({ name: "BagOS", version: pkg.version });
  });
});

describe("startServer — stdio transport (default)", () => {
  it("connects a stdio transport when --http is absent", async () => {
    await startServer();
    expect(MockStdioTransport.instances).toHaveLength(1);
    expect(serverConnect).toHaveBeenCalledWith(MockStdioTransport.instances[0]);
    expect(expressFactory).not.toHaveBeenCalled();
  });

  it("writes nothing to stdout — it is the JSON-RPC channel", async () => {
    // A single stray console.log on stdio corrupts the protocol and the client
    // reports an opaque parse failure.
    await startServer();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("startServer — HTTP mode", () => {
  beforeEach(() => {
    process.argv = ["node", "/somewhere/build/index.js", "--http"];
  });

  it("installs cors and the json body parser", async () => {
    await startServer();
    expect(mockApp.use).toHaveBeenCalledWith(corsMiddleware);
    expect(mockApp.use).toHaveBeenCalledWith(jsonMiddleware);
    expect(MockStdioTransport.instances).toHaveLength(0);
  });

  it("listens on 3050 by default, on all interfaces", async () => {
    await startServer();
    expect(mockApp.listen).toHaveBeenCalledWith(3050, "0.0.0.0", expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("3050"));
  });

  it("honours PORT", async () => {
    process.env["PORT"] = "4123";
    await startServer();
    expect(mockApp.listen).toHaveBeenCalledWith(4123, "0.0.0.0", expect.any(Function));
  });

  it("serves /health with the name, version and advertised tool list", async () => {
    await startServer();
    const res = fakeRes();
    await routeHandler(mockApp.get, "/health")({}, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe("ok");
    expect(payload.name).toBe(pkg.name);
    expect(payload.version).toBe(pkg.version);
    // Sorted because an ES module namespace orders its keys for us; the
    // contract is the set of names, not the order. __esModule, if the loader
    // adds one, must not appear.
    expect([...payload.tools].sort()).toEqual([
      "AlphaTool",
      "BetaTool",
      "MissingTool",
      "NOT_A_TOOL",
    ]);
    expect(payload.tools).not.toContain("__esModule");
  });

  it("handles a POST /mcp through a fresh transport per request", async () => {
    await startServer();
    const req = { body: { jsonrpc: "2.0", method: "ping" } };
    const res = fakeRes();
    await routeHandler(mockApp.post, "/mcp")(req, res);

    expect(MockHttpTransport.instances).toHaveLength(1);
    expect(MockHttpTransport.instances[0]?.opts).toEqual({ sessionIdGenerator: undefined });
    expect(serverConnect).toHaveBeenCalledWith(MockHttpTransport.instances[0]);
    expect(transportHandleRequest).toHaveBeenCalledWith(req, res, req.body);
  });

  it("closes the transport when the client hangs up", async () => {
    await startServer();
    const res = fakeRes();
    await routeHandler(mockApp.post, "/mcp")({ body: {} }, res);
    expect(transportClose).not.toHaveBeenCalled();
    res.fire("close");
    expect(transportClose).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the handler throws, without killing the server", async () => {
    await startServer();
    serverConnect.mockRejectedValueOnce(new Error("transport exploded"));
    const res = fakeRes();
    await expect(routeHandler(mockApp.post, "/mcp")({ body: {} }, res)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith("Error in MCP HTTP endpoint:", expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("does not try to write a 500 once the response has started", async () => {
    // Writing a second status on a streamed response throws inside the catch
    // block and takes the process down with it.
    await startServer();
    transportHandleRequest.mockRejectedValueOnce(new Error("mid-stream failure"));
    const res = fakeRes({ headersSent: true });
    await routeHandler(mockApp.post, "/mcp")({ body: {} }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("fatal", () => {
  it("reports the error to stderr and exits 1", () => {
    const err = new Error("boom");
    expect(() => fatal(err)).toThrow("process.exit(1)");
    expect(errSpy).toHaveBeenCalledWith("Fatal error starting server:", err);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("isEntrypoint", () => {
  it("is false when argv[1] is absent", () => {
    expect(isEntrypoint(undefined)).toBe(false);
  });

  it("is true for a direct `node build/index.js` invocation", () => {
    expect(isEntrypoint(INDEX_PATH)).toBe(true);
  });

  it("is true through a symlink, which is how the `bin` shim runs", () => {
    // node_modules/.bin/bagos-mcp-server is a symlink to build/index.js, and
    // Node does not resolve symlinks in argv[1]. Without the realpath step,
    // every installed copy would start and silently do nothing.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bagos-bin-"));
    const shim = path.join(dir, "bagos-mcp-server");
    try {
      fs.symlinkSync(INDEX_PATH, shim);
      expect(isEntrypoint(shim)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is false for another file", () => {
    expect(isEntrypoint(path.resolve(path.dirname(INDEX_PATH), "lib/preflight.ts"))).toBe(false);
  });

  it("is false, not fatal, when argv[1] cannot be resolved", () => {
    expect(isEntrypoint("/no/such/path/on/disk-12345")).toBe(false);
  });
});

describe("main", () => {
  it("does nothing when the module was imported rather than run", () => {
    // This is what happens on `await import("../index.js")` above, and what
    // makes this whole suite possible.
    main("/usr/local/bin/some-other-program");
    expect(reportPreflight).not.toHaveBeenCalled();
  });

  it("starts the server when this file is the entrypoint", async () => {
    main(INDEX_PATH);
    await new Promise((resolve) => setImmediate(resolve));
    expect(reportPreflight).toHaveBeenCalledTimes(1);
    expect(MockStdioTransport.instances).toHaveLength(1);
  });

  it("defaults to process.argv[1]", () => {
    process.argv = ["node", "/not/this/file.js"];
    main();
    expect(reportPreflight).not.toHaveBeenCalled();
  });

  it("routes a startup failure into fatal()", async () => {
    // Let process.exit return here, as the real one would from fatal()'s
    // perspective — throwing inside a .catch() would only produce an unhandled
    // rejection and hide what is being tested.
    exitSpy.mockImplementation((() => undefined) as never);
    serverConnect.mockRejectedValueOnce(new Error("transport refused"));
    main(INDEX_PATH);
    await new Promise((resolve) => setImmediate(resolve));
    expect(errSpy).toHaveBeenCalledWith("Fatal error starting server:", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
