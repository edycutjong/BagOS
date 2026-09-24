import {
  assertSignableChallenge,
  resolveAuthBaseUrl,
  TransactionChallengeError,
  UnsignableChallengeError,
  DEFAULT_BAGS_API_URL,
  MAX_CHALLENGE_BYTES,
} from "../../lib/challenge.js";
import { Keypair, PublicKey, SystemProgram, TransactionMessage } from "@solana/web3.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("assertSignableChallenge", () => {
  it("accepts a plain-text sign-in message, with tabs and newlines", () => {
    expect(() => assertSignableChallenge(enc("Sign in to Bags\nNonce:\t8f14e45f"))).not.toThrow();
    expect(() => assertSignableChallenge(enc("Masuk ke Bags — ñ ✓"))).not.toThrow();
  });

  it("refuses a transaction message with the transaction-specific error", () => {
    const payer = Keypair.generate().publicKey;
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CZ6YjUzgU6Nq",
      instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: new PublicKey(new Uint8Array(32).fill(7)), lamports: 1 })],
    }).compileToV0Message().serialize();
    expect(() => assertSignableChallenge(msg)).toThrow(TransactionChallengeError);
  });

  /* The deny-list alone would sign these: a message version web3.js does not
     know yet, and any other binary payload such as an off-chain order. */
  it("refuses a future-version message that the transaction parser rejects", () => {
    const bytes = new Uint8Array(200);
    bytes[0] = 0x81; // "v1": versioned prefix, unknown version
    bytes.set(Keypair.generate().publicKey.toBytes(), 4);
    expect(() => assertSignableChallenge(bytes)).toThrow(UnsignableChallengeError);
  });

  it("refuses raw binary such as a public key", () => {
    expect(() => assertSignableChallenge(Keypair.generate().publicKey.toBytes())).toThrow(
      UnsignableChallengeError
    );
  });

  it("refuses invalid UTF-8", () => {
    expect(() => assertSignableChallenge(new Uint8Array([0x53, 0xff, 0x53]))).toThrow("not valid UTF-8");
  });

  it("refuses valid UTF-8 carrying control characters", () => {
    expect(() => assertSignableChallenge(enc("ok\u0001ok"))).toThrow("control characters");
    expect(() => assertSignableChallenge(enc("ok\u007fok"))).toThrow("control characters");
  });

  it("refuses a byte-order mark (invisible, would defeat an exact-bytes check)", () => {
    // EF BB BF at the start decodes to U+FEFF and is otherwise invisible.
    expect(() => assertSignableChallenge(enc("\uFEFFSign in to Bags"))).toThrow("control characters");
    expect(() => assertSignableChallenge(enc("Sign in\uFEFFto Bags"))).toThrow("control characters");
  });

  it("refuses empty and oversized challenges", () => {
    expect(() => assertSignableChallenge(new Uint8Array())).toThrow("empty");
    expect(() => assertSignableChallenge(enc("a".repeat(MAX_CHALLENGE_BYTES + 1)))).toThrow("limit");
    expect(() => assertSignableChallenge(enc("a".repeat(MAX_CHALLENGE_BYTES)))).not.toThrow();
  });
});

describe("resolveAuthBaseUrl", () => {
  it("defaults to the Bags API", () => {
    expect(resolveAuthBaseUrl({})).toBe(DEFAULT_BAGS_API_URL);
    expect(resolveAuthBaseUrl({ BAGS_API_URL: "  " })).toBe(DEFAULT_BAGS_API_URL);
  });

  it("accepts https on bags.fm and its subdomains", () => {
    expect(resolveAuthBaseUrl({ BAGS_API_URL: "https://bags.fm/api" })).toBe("https://bags.fm/api");
    expect(resolveAuthBaseUrl({ BAGS_API_URL: "https://staging.api.bags.fm/v1" })).toBe(
      "https://staging.api.bags.fm/v1"
    );
  });

  it.each([
    "https://attacker.example",
    "http://public-api-v2.bags.fm/api/v1",
    "https://bags.fm.attacker.example",
    "https://evilbags.fm",
    "https://bags.fm@attacker.example",
  ])("refuses %s", (url) => {
    expect(() => resolveAuthBaseUrl({ BAGS_API_URL: url })).toThrow("must be an https URL on bags.fm");
  });

  it("refuses something that is not a URL", () => {
    expect(() => resolveAuthBaseUrl({ BAGS_API_URL: "not a url" })).toThrow("not a valid URL");
  });

  it("allows any URL only with the explicit opt-out", () => {
    expect(
      resolveAuthBaseUrl({ BAGS_API_URL: "http://localhost:9999", BAGS_ALLOW_CUSTOM_API_URL: "TRUE" })
    ).toBe("http://localhost:9999");
  });
});
