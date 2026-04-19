import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { loadKeypair } from "../../lib/wallet";

describe("wallet.ts — loadKeypair", () => {
  const tmpDir = path.join(__dirname, ".tmp-test-wallet");
  const validPath = path.join(tmpDir, "keypair.json");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Generate a real keypair and save it
    const kp = Keypair.generate();
    fs.writeFileSync(validPath, JSON.stringify(Array.from(kp.secretKey)));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads a valid keypair from file", () => {
    const kp = loadKeypair(validPath);
    expect(kp).toBeInstanceOf(Keypair);
    expect(kp.publicKey.toBase58()).toBeTruthy();
  });

  it("throws if file does not exist", () => {
    expect(() => loadKeypair("/nonexistent/path/keypair.json")).toThrow(
      "Keypair file not found"
    );
  });

  it("throws on invalid JSON content", () => {
    const badPath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badPath, "not-json");
    expect(() => loadKeypair(badPath)).toThrow("Failed to parse keypair");
  });

  it("throws on non-array JSON content", () => {
    const objPath = path.join(tmpDir, "obj.json");
    fs.writeFileSync(objPath, JSON.stringify({ key: "value" }));
    expect(() => loadKeypair(objPath)).toThrow("Failed to parse keypair");
  });

  it("resolves ~ to home directory", () => {
    // This will throw because the file doesn't exist at ~/test-keypair.json,
    // but it should resolve the path correctly
    expect(() => loadKeypair("~/nonexistent-test-keypair.json")).toThrow(
      "Keypair file not found"
    );
  });
});
