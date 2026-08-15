import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Wallet } from "../../lib/wallet.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const kp = Wallet.loadKeypair(validPath);
    expect(kp).toBeInstanceOf(Keypair);
    expect(kp.publicKey.toBase58()).toBeTruthy();
  });

  it("throws if file does not exist", () => {
    expect(() => Wallet.loadKeypair("/nonexistent/path/keypair.json")).toThrow(
      "Keypair file not found"
    );
  });

  it("throws on invalid JSON content", () => {
    const badPath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badPath, "not-json");
    expect(() => Wallet.loadKeypair(badPath)).toThrow("is not valid JSON");
  });

  it("throws on non-array JSON content", () => {
    const objPath = path.join(tmpDir, "obj.json");
    fs.writeFileSync(objPath, JSON.stringify({ key: "value" }));
    expect(() => Wallet.loadKeypair(objPath)).toThrow("must contain a JSON array of 64 bytes");
  });

  it("throws with the actual byte count when the array is not 64 bytes", () => {
    const shortPath = path.join(tmpDir, "short.json");
    fs.writeFileSync(shortPath, JSON.stringify(Array.from({ length: 32 }, () => 7)));
    expect(() => Wallet.loadKeypair(shortPath)).toThrow("contains 32 bytes; expected 64");
  });

  it("throws a clean error for 64 bytes that are not a valid Ed25519 key", () => {
    // 64 zero bytes: right length, but the trailing 32 bytes are not the
    // public key derived from the leading 32, so web3.js rejects it.
    const zerosPath = path.join(tmpDir, "zeros.json");
    fs.writeFileSync(zerosPath, JSON.stringify(new Array(64).fill(0)));
    let thrown: Error | null = null;
    try {
      Wallet.loadKeypair(zerosPath);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toContain("not a valid Ed25519 secret key");
    // The security contract: nothing derived from the file's contents may
    // appear in the error — only the path and a fixed description.
    expect(thrown?.message).not.toContain("0,0");
    expect(thrown?.message).not.toContain("secretKey is invalid");
  });

  it("resolves ~ to home directory", () => {
    // This will throw because the file doesn't exist at ~/test-keypair.json,
    // but it should resolve the path correctly
    expect(() => Wallet.loadKeypair("~/nonexistent-test-keypair.json")).toThrow(
      "Keypair file not found"
    );
  });

  it("uses USERPROFILE when HOME is not set", () => {
    const originalHome = process.env.HOME;
    const originalUser = process.env.USERPROFILE;
    delete process.env.HOME;
    process.env.USERPROFILE = "/fake/userprofile";
    
    expect(() => Wallet.loadKeypair("~/nonexistent.json")).toThrow("Keypair file not found");
    
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUser;
  });

  it("uses empty string when neither HOME nor USERPROFILE is set", () => {
    const originalHome = process.env.HOME;
    const originalUser = process.env.USERPROFILE;
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    
    expect(() => Wallet.loadKeypair("~/nonexistent.json")).toThrow("Keypair file not found");
    
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUser;
  });
});
