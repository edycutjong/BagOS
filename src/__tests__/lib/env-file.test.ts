import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import { loadEnvFile } from "../../lib/env-file.js";

let dir: string;
let errSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bagos-env-"));
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
  fs.rmSync(dir, { recursive: true, force: true });
});

/* A2A-R01-01: a repository's .env could set BAGS_API_URL and the safety
   switches for any MCP server started in that repository's folder. */
describe("loadEnvFile", () => {
  it("ignores a .env in the working directory, and says so on stderr", () => {
    fs.writeFileSync(
      path.join(dir, ".env"),
      "BAGS_API_URL=https://attacker.example\nBAGS_ALLOW_UNCONFIRMED=true\n"
    );
    const env: NodeJS.ProcessEnv = {};

    expect(loadEnvFile(env, dir)).toBe("ignored-cwd");
    expect(env["BAGS_API_URL"]).toBeUndefined();
    expect(env["BAGS_ALLOW_UNCONFIRMED"]).toBeUndefined();
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("BAGS_ENV_FILE=");
  });

  it("loads the file named by BAGS_ENV_FILE", () => {
    const file = path.join(dir, "bagos.env");
    fs.writeFileSync(file, "BAGS_API_KEY=abc\n");
    const env: NodeJS.ProcessEnv = { BAGS_ENV_FILE: ` ${file} ` };

    expect(loadEnvFile(env, dir)).toBe("loaded");
    expect(env["BAGS_API_KEY"]).toBe("abc");
  });

  it("refuses a relative BAGS_ENV_FILE, which would resolve against the cwd", () => {
    fs.writeFileSync(path.join(dir, ".env"), "BAGS_API_URL=https://attacker.example\n");
    const env: NodeJS.ProcessEnv = { BAGS_ENV_FILE: ".env" };
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(loadEnvFile(env, dir)).toBe("refused-relative");
    } finally {
      process.chdir(cwd);
    }
    expect(env["BAGS_API_URL"]).toBeUndefined();
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("must be an absolute path");
  });

  it("reports a BAGS_ENV_FILE that does not exist", () => {
    const env: NodeJS.ProcessEnv = { BAGS_ENV_FILE: path.join(dir, "typo.env") };
    expect(loadEnvFile(env, dir)).toBe("missing");
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("does not exist");
  });

  it("never overrides a value the MCP client already set", () => {
    const file = path.join(dir, "bagos.env");
    fs.writeFileSync(file, "BAGS_MAX_SOL_PER_TX=1000\n");
    const env: NodeJS.ProcessEnv = { BAGS_ENV_FILE: file, BAGS_MAX_SOL_PER_TX: "0.1" };

    loadEnvFile(env, dir);
    expect(env["BAGS_MAX_SOL_PER_TX"]).toBe("0.1");
  });

  it("does nothing, silently, when there is no file at all", () => {
    expect(loadEnvFile({}, dir)).toBe("none");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("defaults to process.env and process.cwd()", () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(loadEnvFile()).toBe(process.env["BAGS_ENV_FILE"] ? "loaded" : "none");
    } finally {
      process.chdir(cwd);
    }
  });
});
